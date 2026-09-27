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


# Skills come from a controlled 61-item vocabulary, so they group cleanly into
# themes. LLM-extracted `interest_tags` do not: 451 distinct tags across 400
# people means nearly every tag is near-unique, and ranking them by lift just
# surfaces one-offs ("ebpf", "kicad", "food waste") that describe nobody.
SKILL_THEMES: dict[str, str] = {
    "PyTorch": "ML/AI", "TensorFlow": "ML/AI", "JAX": "ML/AI", "CUDA": "ML/AI",
    "scikit-learn": "ML/AI", "Hugging Face": "ML/AI",
    "TypeScript": "Web dev", "React": "Web dev", "Next.js": "Web dev",
    "Node.js": "Web dev", "Tailwind": "Web dev", "HTML/CSS": "Web dev",
    "PostgreSQL": "Web dev", "Firebase": "Web dev",
    "Swift": "Mobile", "SwiftUI": "Mobile", "Kotlin": "Mobile",
    "Flutter": "Mobile", "React Native": "Mobile",
    "Arduino": "Hardware", "Raspberry Pi": "Hardware", "KiCad": "Hardware",
    "Verilog": "Hardware", "C": "Hardware",
    "ROS": "Robotics", "OpenCV": "Robotics", "SolidWorks": "Robotics", "MATLAB": "Robotics",
    "Rust": "Systems", "Go": "Systems", "Kubernetes": "Systems",
    "gRPC": "Systems", "Solidity": "Systems", "Linux": "Systems", "C++": "Systems",
    "Burp Suite": "Security", "Ghidra": "Security", "Wireshark": "Security",
    "Unity": "Games", "Unreal Engine": "Games", "Blender": "Games",
    "Three.js": "Games", "GLSL": "Games", "C#": "Games",
    "Figma": "Design", "Framer": "Design", "Adobe Suite": "Design",
    "User Research": "Design", "Prototyping": "Design",
    "NumPy": "Data", "pandas": "Data", "SQL": "Data", "R": "Data",
    "Spark": "Data", "dbt": "Data", "Tableau": "Data", "D3.js": "Data",
    "GIS": "Geo/Civic", "Leaflet": "Geo/Civic",
    "Biopython": "Bio/Health",
}

# A theme must clear this share of a cluster before it names it.
_THEME_FLOOR_FRAC = 0.10
# Above this, the cluster really is "that school".
_SCHOOL_DOMINANT = 0.45
# ...and a theme must actually SET THE CLUSTER APART before it goes in the
# name. The big single-school clusters contain every topic in roughly
# population proportion (lift 0.6-1.4, nothing above 16% share); picking the
# argmax there produces a confident label for a group that has no topic
# identity at all. Better to just call it by its school.
_THEME_MIN_LIFT = 1.35
_THEME_MIN_SHARE = 0.18


def _derive_cluster_labels(
    participants: list[dict], cluster_ids: np.ndarray
) -> dict[str, str]:
    """Name each cluster from what it actually contains: its dominant school
    and its most over-represented skill theme.

    These clusters are school-shaped in practice (school explains them far
    better than topic does), so a label describing only "technical focus" is
    not a loose fit - it is wrong, and it invites someone to click in and find
    every archetype sitting there together.
    """
    import math
    from collections import Counter

    def themes(p: dict) -> list[str]:
        return [SKILL_THEMES[s] for s in p.get("skills", []) if s in SKILL_THEMES]

    overall = Counter(t for p in participants for t in themes(p))
    total = sum(overall.values()) or 1

    labels: dict[str, str] = {}
    used: set[str] = set()
    for cid in sorted(set(int(c) for c in cluster_ids)):
        members = [participants[i] for i in range(len(participants)) if int(cluster_ids[i]) == cid]
        if not members:
            continue

        schools = Counter(p.get("school", "") for p in members)
        school, school_n = schools.most_common(1)[0]
        share = school_n / len(members)

        counts = Counter(t for p in members for t in themes(p))
        in_cluster = sum(counts.values()) or 1
        floor = max(3, int(_THEME_FLOOR_FRAC * len(members)))
        # Lift, damped by sqrt(count): raw lift crowns whatever is rarest
        # overall, which is never a good name for a group of 50 people.
        def lift(t: str) -> float:
            return (counts[t] / in_cluster) / (overall[t] / total)

        ranked = sorted(
            (
                t
                for t in counts
                if counts[t] >= floor
                and lift(t) >= _THEME_MIN_LIFT
                and counts[t] / in_cluster >= _THEME_MIN_SHARE
            ),
            key=lambda t: lift(t) * math.sqrt(counts[t]),
            reverse=True,
        )
        theme = ranked[0] if ranked else None

        if share >= _SCHOOL_DOMINANT and school:
            label = f"{school} · {theme}" if theme else school
        elif theme:
            label = f"{theme} · mixed schools"
        else:
            label = school or f"Group {cid + 1}"

        if label in used:
            label = f"{label} {cid + 1}"
        used.add(label)
        labels[str(cid)] = label
    return labels


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
        return _fallback_cluster_labels(participants, cluster_ids)


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

    # Derived from the members themselves, not written by the LLM. The LLM was
    # only ever shown skills and tags, which explain ~7% of how these clusters
    # actually form, so it confabulated plausible "technical focus" names for
    # groups that are really schools.
    cluster_labels = _derive_cluster_labels(participants, cluster_ids)

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
