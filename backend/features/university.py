import numpy as np


def compute(participants: list[dict]) -> np.ndarray:
    n = len(participants)
    mat = np.zeros((n, n), dtype=np.float32)
    for i in range(n):
        for j in range(n):
            if i == j:
                mat[i, j] = 1.0
                continue
            a, b = participants[i], participants[j]
            if a["school"] == b["school"]:
                if a["major"] == b["major"]:
                    score = 1.0
                elif a["year"] == b["year"]:
                    score = 0.85
                else:
                    score = 0.75
            elif a["major"] == b["major"]:
                score = 0.4
            elif a["year"] == b["year"]:
                score = 0.2
            else:
                score = 0.0
            mat[i, j] = score
    return mat
