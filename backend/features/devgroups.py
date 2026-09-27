"""Shared student organizations.

Club names are stored unscoped ("Robotics Club"), so this module decides what
sharing one means. Two people in the same club at the same school almost
certainly already know each other. Two people in the same club at different
schools do not - but they share a subculture and a ready-made opening line,
which is exactly the kind of connection the map exists to surface. Scoring
those identically would waste the signal; scoring the cross-school case at
zero would throw it away.
"""

import numpy as np

SAME_SCHOOL_WEIGHT = 1.0
CROSS_SCHOOL_WEIGHT = 0.5


def _jaccard(a: set, b: set) -> float:
    union = a | b
    return len(a & b) / len(union) if union else 0.0


def compute(participants: list[dict]) -> np.ndarray:
    n = len(participants)
    groups = [set(p.get("dev_groups", [])) for p in participants]
    schools = [p.get("school", "") for p in participants]

    mat = np.zeros((n, n), dtype=np.float32)
    for i in range(n):
        mat[i, i] = 1.0
        for j in range(i + 1, n):
            overlap = _jaccard(groups[i], groups[j])
            if overlap == 0.0:
                continue
            weight = SAME_SCHOOL_WEIGHT if schools[i] == schools[j] else CROSS_SCHOOL_WEIGHT
            score = overlap * weight
            mat[i, j] = score
            mat[j, i] = score
    return mat
