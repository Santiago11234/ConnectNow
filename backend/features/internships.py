import numpy as np


def _jaccard(set_a: set, set_b: set) -> float:
    if not set_a and not set_b:
        return 0.5
    union = set_a | set_b
    if not union:
        return 0.0
    return len(set_a & set_b) / len(union)


def compute(participants: list[dict]) -> np.ndarray:
    n = len(participants)
    companies = [set(i["company"] for i in p.get("internships", [])) for p in participants]
    industries = [
        set(i["industry"] for i in p.get("internships", []) if i.get("industry"))
        for p in participants
    ]

    mat = np.zeros((n, n), dtype=np.float32)
    for i in range(n):
        for j in range(n):
            if i == j:
                mat[i, j] = 1.0
                continue
            comp_sim = _jaccard(companies[i], companies[j])
            ind_sim = _jaccard(industries[i], industries[j])
            mat[i, j] = 0.5 * comp_sim + 0.5 * ind_sim
    return mat
