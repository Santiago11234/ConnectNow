"""Campus life outside the CS building: hackathons attended and involvement.

Two different kinds of overlap, blended:
  - Hackathons are *events*. Having been at the same one means you were
    physically in the same room, so this is weighted higher.
  - Involvement (research, TA-ing, Greek life, intramurals) is a lifestyle
    overlap - weaker evidence of having met, but a real thing in common.
"""

import numpy as np

HACKATHON_WEIGHT = 0.6
INVOLVEMENT_WEIGHT = 0.4


def _jaccard(a: set, b: set) -> float:
    union = a | b
    return len(a & b) / len(union) if union else 0.0


def compute(participants: list[dict]) -> np.ndarray:
    n = len(participants)
    hacks = [set(p.get("hackathons", [])) for p in participants]
    inv = [set(p.get("involvement", [])) for p in participants]

    mat = np.zeros((n, n), dtype=np.float32)
    for i in range(n):
        mat[i, i] = 1.0
        for j in range(i + 1, n):
            score = HACKATHON_WEIGHT * _jaccard(hacks[i], hacks[j]) + INVOLVEMENT_WEIGHT * _jaccard(
                inv[i], inv[j]
            )
            if score:
                mat[i, j] = score
                mat[j, i] = score
    return mat
