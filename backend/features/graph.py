import numpy as np
import networkx as nx


def compute(participants: list[dict]) -> np.ndarray:
    n = len(participants)
    id_to_idx = {p["id"]: i for i, p in enumerate(participants)}

    G = nx.Graph()
    G.add_nodes_from(range(n))

    for i, p in enumerate(participants):
        for friend_id in p.get("friends", []):
            j = id_to_idx.get(friend_id)
            if j is not None and i != j:
                G.add_edge(i, j)

    mat = np.zeros((n, n), dtype=np.float32)
    np.fill_diagonal(mat, 1.0)

    try:
        aa_scores = list(nx.resource_allocation_index(G))
        if aa_scores:
            max_score = max(score for _, _, score in aa_scores) or 1.0
            for u, v, score in aa_scores:
                normalized = min(float(score) / max_score, 1.0)
                mat[u, v] = normalized
                mat[v, u] = normalized
    except Exception as e:
        print(f"Graph similarity error: {e}")

    # Cross-team friend bonus
    for i, p in enumerate(participants):
        for friend_id in p.get("friends", []):
            j = id_to_idx.get(friend_id)
            if j is None:
                continue
            team_i = p.get("team_id")
            team_j = participants[j].get("team_id")
            if team_i and team_j and team_i != team_j:
                mat[i, j] = min(mat[i, j] + 0.2, 1.0)
                mat[j, i] = min(mat[j, i] + 0.2, 1.0)

    return mat
