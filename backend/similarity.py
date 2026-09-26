import numpy as np
from typing import Optional

DEFAULT_WEIGHTS = {
    "university": 0.20,
    "grade": 0.10,
    "internships": 0.20,
    "interests": 0.35,
    "network": 0.15,
}


def compute_all(participants: list[dict]) -> dict[str, np.ndarray]:
    import time
    import sys
    import os
    sys.path.insert(0, os.path.dirname(__file__))
    from features import university, grade, internships, interests, graph

    results = {}
    for name, module in [
        ("university", university),
        ("grade", grade),
        ("internships", internships),
        ("interests", interests),
        ("network", graph),
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
