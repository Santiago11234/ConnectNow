import numpy as np
from typing import Optional

# Weights reflect each signal's measured AUC at predicting real friendships on
# held-out edges (see gnn.metrics and backend/tests): the learned GNN embedding
# is the strongest single predictor at 0.705, ahead of university (0.668) and
# interests (0.598). `grade` measures 0.505 - indistinguishable from chance -
# so it is kept only as a slider the demo can turn up, not as real signal.
# `internships` is weighted well above its friendship-prediction AUC (0.529)
# on purpose. That AUC answers "did these two already know each other", which
# is not the question this product asks. Having worked at the same company is
# weak evidence of an existing friendship and strong grounds for an
# introduction, and it is the kind of match a person cannot find on their own.
DEFAULT_WEIGHTS = {
    "gnn": 0.24,
    "interests": 0.20,
    "dev_groups": 0.16,
    "university": 0.12,
    "network": 0.12,
    "internships": 0.10,
    "campus": 0.04,
    "grade": 0.02,
}


def compute_all(participants: list[dict]) -> dict[str, np.ndarray]:
    import time
    import sys
    import os
    sys.path.insert(0, os.path.dirname(__file__))
    from features import university, grade, internships, interests, graph, devgroups, campus
    import gnn

    results = {}
    for name, module in [
        ("university", university),
        ("grade", grade),
        ("internships", internships),
        ("interests", interests),
        ("network", graph),
        ("dev_groups", devgroups),
        ("campus", campus),
        ("gnn", gnn),
    ]:
        t0 = time.time()
        results[name] = module.compute(participants)
        print(f"  {name}: {time.time() - t0:.2f}s")

    return results


def composite(
    matrices: dict[str, np.ndarray], weights: Optional[dict] = None
) -> np.ndarray:
    if weights is None:
        weights = DEFAULT_WEIGHTS

    total = sum(weights.values())
    normalized = {k: v / total for k, v in weights.items()}

    result = None
    for name, w in normalized.items():
        if name in matrices:
            if result is None:
                result = w * matrices[name]
            else:
                result += w * matrices[name]

    if result is None:
        n = next(iter(matrices.values())).shape[0]
        return np.eye(n, dtype=np.float32)

    return np.clip(result, 0.0, 1.0).astype(np.float32)


def quantize_to_uint8(matrix: np.ndarray) -> list[list[int]]:
    return (matrix * 255).clip(0, 255).astype(np.uint8).tolist()
