import json
import hashlib
import os
import numpy as np
from pathlib import Path

CACHE_DIR = Path(__file__).parent.parent / "data" / "cache"


def _get_seriation_order(distance_matrix: np.ndarray) -> list[int]:
    from scipy.cluster.hierarchy import linkage, optimal_leaf_ordering, leaves_list
    from scipy.spatial.distance import squareform

    dist = distance_matrix.copy()
    np.fill_diagonal(dist, 0)
    dist = (dist + dist.T) / 2

    condensed = squareform(dist)
    Z = linkage(condensed, method="ward")
    Z = optimal_leaf_ordering(Z, condensed)
    return leaves_list(Z).tolist()


def _get_umap_coords(distance_matrix: np.ndarray) -> np.ndarray:
    import umap

    dist = distance_matrix.copy()
    np.fill_diagonal(dist, 0)
    dist = (dist + dist.T) / 2

    reducer = umap.UMAP(
        n_components=2,
        metric="precomputed",
        random_state=42,
        n_neighbors=15,
        min_dist=0.1,
    )
    coords = reducer.fit_transform(dist)

    coords -= coords.min(axis=0)
    max_range = coords.max(axis=0)
    max_range[max_range == 0] = 1
    coords /= max_range
    return coords.astype(np.float32)


def _get_clusters(distance_matrix: np.ndarray, n_clusters: int = 10) -> np.ndarray:
    from sklearn.cluster import AgglomerativeClustering

    dist = distance_matrix.copy()
    np.fill_diagonal(dist, 0)

    clustering = AgglomerativeClustering(
        n_clusters=n_clusters,
        metric="precomputed",
        linkage="average",
    )
    return clustering.fit_predict(dist)


def _get_bridge_scores(
    composite_matrix: np.ndarray, cluster_ids: np.ndarray
) -> np.ndarray:
    import networkx as nx

    n = len(cluster_ids)
    G = nx.Graph()
    G.add_nodes_from(range(n))

    off_diag = composite_matrix.copy()
    np.fill_diagonal(off_diag, 0)
    threshold = float(np.percentile(off_diag[off_diag > 0], 70)) if off_diag.max() > 0 else 0.5

    for i in range(n):
        for j in range(i + 1, n):
            if composite_matrix[i, j] >= threshold:
                G.add_edge(i, j, weight=float(composite_matrix[i, j]))

    if len(G.edges) == 0:
        return np.zeros(n, dtype=np.float32)

    betweenness = nx.betweenness_centrality(G, normalized=True)
    scores = np.array([betweenness.get(i, 0.0) for i in range(n)], dtype=np.float32)

    for i in range(n):
        neighbors = list(G.neighbors(i))
        if neighbors:
            neighbor_clusters = set(int(cluster_ids[j]) for j in neighbors)
            if len(neighbor_clusters) > 1:
                scores[i] *= 1.5

    max_score = scores.max()
    if max_score > 0:
        scores /= max_score
    return np.clip(scores, 0.0, 1.0)


def _generate_cluster_labels(
    participants: list[dict], cluster_ids: np.ndarray, client
) -> dict[str, str]:
    from collections import Counter

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    n_clusters = len(set(int(c) for c in cluster_ids))

    cluster_profiles = {}
    for cluster_id in range(n_clusters):
        members = [
            participants[i]
            for i in range(len(participants))
            if int(cluster_ids[i]) == cluster_id
        ]
        if not members:
            continue
        all_skills = []
        for p in members:
            all_skills.extend(p.get("skills", []))
        top_skills = [s for s, _ in Counter(all_skills).most_common(4)]
        all_tags = []
        for p in members:
            all_tags.extend(p.get("interest_tags", []))
        top_tags = [t for t, _ in Counter(all_tags).most_common(4)]
        cluster_profiles[cluster_id] = {
            "size": len(members),
            "skills": top_skills,
            "tags": top_tags,
        }

    cache_key = hashlib.sha256(str(sorted(cluster_profiles.items())).encode()).hexdigest()[:16]
    cache_path = CACHE_DIR / f"cluster_labels_{cache_key}.json"

    if cache_path.exists():
        return json.loads(cache_path.read_text())

    try:
        profile_text = "\n".join(
            f"Cluster {cid}: {p['size']} people, skills: {p['skills']}, tags: {p['tags']}"
            for cid, p in cluster_profiles.items()
        )
        response = client.chat.completions.create(
            model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
            max_tokens=512,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Name these clusters of hackathon participants with 2-4 word labels.\n\n"
                        f"{profile_text}\n\n"
                        f'Return ONLY valid JSON: {{"0": "ML & AI", "1": "Hardware Hackers", ...}}\n'
                        f"Make labels catchy and descriptive of the technical focus."
                    ),
                }
            ],
        )
        raw = response.choices[0].message.content.strip()
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        labels = json.loads(raw)
        for cid in range(n_clusters):
            if str(cid) not in labels:
                labels[str(cid)] = f"Group {cid + 1}"
        cache_path.write_text(json.dumps(labels))
        return labels
    except Exception as e:
        print(f"Cluster label generation failed: {e}")
        return {str(i): f"Group {i + 1}" for i in range(n_clusters)}


def compute_layout(
    composite_matrix: np.ndarray, participants: list[dict], client=None
) -> dict:
    import time

    distance_matrix = 1.0 - composite_matrix
    np.fill_diagonal(distance_matrix, 0)

    t0 = time.time()
    print("Computing seriation order...")
    order = _get_seriation_order(distance_matrix)
    print(f"  Done in {time.time() - t0:.2f}s")

    t0 = time.time()
    print("Computing UMAP coords...")
    coords = _get_umap_coords(distance_matrix)
    print(f"  Done in {time.time() - t0:.2f}s")

    t0 = time.time()
    print("Computing clusters...")
    n_clusters = min(10, max(5, len(participants) // 40))
    cluster_ids = _get_clusters(distance_matrix, n_clusters=n_clusters)
    print(f"  Done in {time.time() - t0:.2f}s, {n_clusters} clusters")

    t0 = time.time()
    print("Computing bridge scores...")
    bridge_scores = _get_bridge_scores(composite_matrix, cluster_ids)
    print(f"  Done in {time.time() - t0:.2f}s")

    cluster_labels: dict[str, str] = {}
    if client:
        try:
            cluster_labels = _generate_cluster_labels(participants, cluster_ids, client)
        except Exception as e:
            print(f"Cluster labels failed: {e}")

    if not cluster_labels:
        cluster_labels = {str(i): f"Group {i + 1}" for i in range(n_clusters)}

    return {
        "order": order,
        "coords": coords.tolist(),
        "cluster_ids": [int(c) for c in cluster_ids],
        "cluster_labels": cluster_labels,
        "bridge_scores": bridge_scores.tolist(),
        "participants": [
            {
                "id": p["id"],
                "name": p["name"],
                "school": p["school"],
                "team_id": p.get("team_id"),
            }
            for p in participants
        ],
    }
