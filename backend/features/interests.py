import hashlib
import json
import os
from pathlib import Path

import numpy as np

CACHE_DIR = Path(__file__).parent.parent.parent / "data" / "cache"
MODEL_NAME = "all-MiniLM-L6-v2"


def _answers_text(participant: dict) -> str:
    answers = participant.get("answers", {})
    return " ".join(str(v) for v in answers.values())


def _content_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def _load_or_compute_embeddings(participants: list[dict]) -> np.ndarray:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    texts = [_answers_text(p) for p in participants]
    cache_key = _content_hash("".join(sorted(texts)))
    cache_path = CACHE_DIR / f"embeddings_{cache_key}.npy"

    if cache_path.exists():
        print(f"Loading embeddings from cache...")
        return np.load(str(cache_path))

    print(f"Loading sentence-transformers model {MODEL_NAME}...")
    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer(MODEL_NAME)
    embeddings = model.encode(texts, show_progress_bar=True, batch_size=64)
    np.save(str(cache_path), embeddings)
    print(f"Embeddings cached to {cache_path}")
    return embeddings


def _cosine_similarity_matrix(embeddings: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms = np.maximum(norms, 1e-8)
    normed = embeddings / norms
    sim = normed @ normed.T
    return np.clip(sim, 0.0, 1.0).astype(np.float32)


def _tag_jaccard_matrix(participants: list[dict]) -> np.ndarray:
    n = len(participants)
    tags = [set(p.get("interest_tags", [])) for p in participants]
    mat = np.zeros((n, n), dtype=np.float32)
    for i in range(n):
        for j in range(n):
            if i == j:
                mat[i, j] = 1.0
                continue
            union = tags[i] | tags[j]
            if union:
                mat[i, j] = len(tags[i] & tags[j]) / len(union)
    return mat


def compute(participants: list[dict]) -> np.ndarray:
    embeddings = _load_or_compute_embeddings(participants)
    cosine_mat = _cosine_similarity_matrix(embeddings)

    has_tags = any(p.get("interest_tags") for p in participants)
    if has_tags:
        tag_mat = _tag_jaccard_matrix(participants)
        return (0.6 * cosine_mat + 0.4 * tag_mat).astype(np.float32)
    return cosine_mat


class TagExtractionResult:
    def __init__(self, interest_tags: list, skills: list, domains: list):
        self.interest_tags = [t.lower() for t in interest_tags[:8]]
        self.skills = [s.lower() for s in skills[:6]]
        self.domains = [d.lower() for d in domains[:3]]


def extract_tags_for_participant(participant: dict, client) -> "TagExtractionResult":
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    text = _answers_text(participant)
    cache_key = _content_hash(text)
    cache_path = CACHE_DIR / f"tags_{cache_key}.json"

    if cache_path.exists():
        data = json.loads(cache_path.read_text())
        return TagExtractionResult(**data)

    try:
        response = client.chat.completions.create(
            model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
            max_tokens=256,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Extract structured information from this hackathon participant's profile.\n\n"
                        f"Answers:\n{text}\n\nSkills listed: {', '.join(participant.get('skills', []))}\n\n"
                        f"Return ONLY valid JSON:\n"
                        f'{{"interest_tags": ["tag1"], "skills": ["skill1"], "domains": ["domain1"]}}\n'
                        f"max 8 interest_tags, 6 skills, 3 domains, all lowercase."
                    ),
                }
            ],
        )
        raw = response.choices[0].message.content.strip()
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw)
        result = {
            "interest_tags": [t.lower() for t in data.get("interest_tags", [])[:8]],
            "skills": [s.lower() for s in data.get("skills", [])[:6]],
            "domains": [d.lower() for d in data.get("domains", [])[:3]],
        }
        cache_path.write_text(json.dumps(result))
        return TagExtractionResult(**result)
    except Exception as e:
        print(f"Tag extraction failed for {participant['id']}: {e}")
        return TagExtractionResult([], [], [])
