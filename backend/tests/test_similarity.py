import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import numpy as np
import pytest


def make_test_participants(n: int = 8) -> list[dict]:
    import random

    rng = random.Random(42)
    schools = ["Georgia Tech", "MIT", "Stanford", "CMU", "Emory"]
    years = ["Freshman", "Sophomore", "Junior", "Senior", "Master's"]
    majors = ["Computer Science", "Electrical Engineering", "Mathematics", "Biology"]
    participants = []
    for i in range(n):
        participants.append(
            {
                "id": f"test{i:03d}",
                "name": f"Test User {i}",
                "school": rng.choice(schools),
                "major": rng.choice(majors),
                "year": rng.choice(years),
                "grad_year": rng.randint(2025, 2030),
                "team_id": f"team-{i // 3:03d}",
                "teammates": [
                    f"test{j:03d}"
                    for j in range(max(0, i - 1), min(n, i + 2))
                    if j != i
                ],
                "friends": [
                    f"test{j:03d}"
                    for j in rng.sample(range(n), min(3, n - 1))
                    if j != i
                ],
                "internships": (
                    [
                        {
                            "company": rng.choice(["Google", "Meta", "Apple"]),
                            "role": "Intern",
                            "industry": "Big Tech",
                            "year": 2024,
                        }
                    ]
                    if rng.random() > 0.5
                    else []
                ),
                "skills": rng.sample(["Python", "PyTorch", "TypeScript", "React", "C++"], 3),
                "answers": {
                    "What topics or technologies are you most excited about?": f"I love {rng.choice(['ML', 'web dev', 'hardware'])} and data",
                    "What do you want to build this weekend?": "A great project",
                    "What's your favorite tool or technology, and why?": rng.choice(["Python", "TypeScript"]),
                    "Tell us a fun fact about yourself.": "I make good coffee",
                },
                "interest_tags": rng.sample(
                    ["machine learning", "web", "hardware", "security", "data"], 2
                ),
                "is_synthetic": True,
            }
        )
    return participants


def check_matrix_properties(mat: np.ndarray, name: str) -> None:
    n = mat.shape[0]
    assert mat.shape == (n, n), f"{name}: not square"
    assert np.allclose(mat, mat.T, atol=1e-4), f"{name}: not symmetric"
    assert np.all(mat >= -1e-5) and np.all(mat <= 1.0 + 1e-5), f"{name}: out of [0,1]"
    assert np.allclose(np.diag(mat), 1.0, atol=1e-4), f"{name}: diagonal not 1"


def test_university():
    from features import university
    mat = university.compute(make_test_participants(8))
    check_matrix_properties(mat, "university")


def test_grade():
    from features import grade
    mat = grade.compute(make_test_participants(8))
    check_matrix_properties(mat, "grade")


def test_internships():
    from features import internships
    mat = internships.compute(make_test_participants(8))
    check_matrix_properties(mat, "internships")


def test_graph():
    from features import graph
    mat = graph.compute(make_test_participants(8))
    check_matrix_properties(mat, "graph")


def test_interests_small():
    from features import interests
    p = make_test_participants(5)
    mat = interests.compute(p)
    check_matrix_properties(mat, "interests")
    off_diag = mat.copy()
    np.fill_diagonal(off_diag, 0)
    assert off_diag.max() >= 0, "interests: matrix computed"


def test_composite():
    from features import university, grade
    import similarity
    p = make_test_participants(5)
    matrices = {
        "university": university.compute(p),
        "grade": grade.compute(p),
    }
    comp = similarity.composite(matrices, {"university": 0.5, "grade": 0.5})
    assert comp.shape == (5, 5)
    assert np.all(comp >= -1e-5) and np.all(comp <= 1.0 + 1e-5)
    assert np.allclose(np.diag(comp), 1.0, atol=1e-4)
