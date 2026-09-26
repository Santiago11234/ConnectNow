import numpy as np

YEAR_NUM = {"Freshman": 1, "Sophomore": 2, "Junior": 3, "Senior": 4, "Master's": 5, "PhD": 6}
MAX_GAP = 5.0


def compute(participants: list[dict]) -> np.ndarray:
    n = len(participants)
    nums = [YEAR_NUM.get(p["year"], 3) for p in participants]
    mat = np.zeros((n, n), dtype=np.float32)
    for i in range(n):
        for j in range(n):
            mat[i, j] = 1.0 - abs(nums[i] - nums[j]) / MAX_GAP
    return mat
