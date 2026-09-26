import hashlib
import json
import os
from pathlib import Path

CACHE_DIR = Path(__file__).parent.parent / "data" / "cache"


def _pair_cache_key(id_a: str, id_b: str) -> str:
    pair = tuple(sorted([id_a, id_b]))
    return hashlib.sha256(str(pair).encode()).hexdigest()[:16]


def _shared_facts(a: dict, b: dict) -> list[str]:
    facts = []
    if a["school"] == b["school"]:
        facts.append(f"Both attend {a['school']}")
    companies_a = set(i["company"] for i in a.get("internships", []))
    companies_b = set(i["company"] for i in b.get("internships", []))
    for c in companies_a & companies_b:
        facts.append(f"Both interned at {c}")
    inds_a = set(i.get("industry", "") for i in a.get("internships", []))
    inds_b = set(i.get("industry", "") for i in b.get("internships", []))
    for ind in inds_a & inds_b:
        if ind:
            facts.append(f"Both worked in {ind}")
    tags_a = set(a.get("interest_tags", []))
    tags_b = set(b.get("interest_tags", []))
    for tag in list(tags_a & tags_b)[:3]:
        facts.append(f"Both interested in {tag}")
    mutual = len(set(a.get("friends", [])) & set(b.get("friends", [])))
    if mutual > 0:
        facts.append(f"{mutual} mutual connection{'s' if mutual > 1 else ''}")
    if a["year"] == b["year"]:
        facts.append(f"Both {a['year']}s")
    return facts[:6]


def explain_pair(
    a: dict,
    b: dict,
    feature_scores: dict[str, float],
    composite_score: float,
    client,
) -> dict:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_key = _pair_cache_key(a["id"], b["id"])
    cache_path = CACHE_DIR / f"explain_{cache_key}.json"

    if cache_path.exists():
        return json.loads(cache_path.read_text())

    shared_facts = _shared_facts(a, b)

    def profile_summary(p: dict) -> str:
        lines = [
            f"Name: {p['name']}",
            f"School: {p['school']}, {p['major']}, {p['year']}",
        ]
        if p.get("internships"):
            companies = [i["company"] for i in p["internships"][:3]]
            lines.append(f"Internships: {', '.join(companies)}")
        if p.get("skills"):
            lines.append(f"Skills: {', '.join(p['skills'][:5])}")
        if p.get("interest_tags"):
            lines.append(f"Interests: {', '.join(p['interest_tags'][:6])}")
        for key, val in p.get("answers", {}).items():
            if "excit" in key.lower() or "topic" in key.lower():
                lines.append(f"Excited about: {str(val)[:200]}")
                break
        return "\n".join(lines)

    feature_text = ", ".join(f"{k}: {v:.2f}" for k, v in feature_scores.items())

    prompt = (
        f"Two hackathon participants have a similarity score of {composite_score:.2f}/1.0.\n\n"
        f"Feature scores: {feature_text}\n"
        f"Shared facts: {', '.join(shared_facts) if shared_facts else 'None found'}\n\n"
        f"Person A:\n{profile_summary(a)}\n\n"
        f"Person B:\n{profile_summary(b)}\n\n"
        f"Write a 2-3 sentence explanation of why these two people would connect well, "
        f"citing ONLY concrete facts from their profiles above. Do NOT invent details.\n"
        f"Also write one specific icebreaker question.\n\n"
        f'Return ONLY valid JSON: {{"explanation": "...", "icebreaker": "..."}}'
    )

    explanation = (
        f"{a['name']} and {b['name']} share strong similarities across multiple dimensions."
    )
    icebreaker = "What are you hoping to build this weekend?"

    try:
        response = client.chat.completions.create(
            model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.choices[0].message.content.strip()
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        data = json.loads(raw)
        explanation = data.get("explanation", explanation)
        icebreaker = data.get("icebreaker", icebreaker)
    except Exception as e:
        print(f"Explain pair failed for {a['id']},{b['id']}: {e}")

    result = {
        "participant_a": {
            "id": a["id"],
            "name": a["name"],
            "school": a["school"],
            "major": a["major"],
            "year": a["year"],
            "interests": " | ".join(a.get("interest_tags", [])[:5]),
        },
        "participant_b": {
            "id": b["id"],
            "name": b["name"],
            "school": b["school"],
            "major": b["major"],
            "year": b["year"],
            "interests": " | ".join(b.get("interest_tags", [])[:5]),
        },
        "composite_score": float(composite_score),
        "feature_scores": {k: float(v) for k, v in feature_scores.items()},
        "explanation": explanation,
        "icebreaker": icebreaker,
        "shared_facts": shared_facts,
    }
    cache_path.write_text(json.dumps(result))
    return result
