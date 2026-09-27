import hashlib
import json
import os
from pathlib import Path

CACHE_DIR = Path(__file__).parent.parent / "data" / "cache"


# Bump when the prompt or phrasing changes, so old cached prose is not reused.
_PROMPT_VERSION = "v2-second-person"


def _pair_cache_key(id_a: str, id_b: str) -> str:
    pair = tuple(sorted([id_a, id_b]))
    return hashlib.sha256((str(pair) + _PROMPT_VERSION).encode()).hexdigest()[:16]


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
    same_school = a["school"] == b["school"]
    for g in sorted(set(a.get("dev_groups", [])) & set(b.get("dev_groups", []))):
        facts.append(
            f"Both in {g} at {a['school']}" if same_school else f"Both in {g} (different schools)"
        )
    for h in sorted(set(a.get("hackathons", [])) & set(b.get("hackathons", [])))[:2]:
        facts.append(f"Both attended {h}")
    for v in sorted(set(a.get("involvement", [])) & set(b.get("involvement", [])))[:2]:
        facts.append(f"Both do {v}")
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
        if p.get("dev_groups"):
            lines.append(f"Student orgs: {', '.join(p['dev_groups'])}")
        if p.get("hackathons"):
            lines.append(f"Past hackathons: {', '.join(p['hackathons'][:4])}")
        if p.get("involvement"):
            lines.append(f"Campus involvement: {', '.join(p['involvement'][:4])}")
        if p.get("interest_tags"):
            lines.append(f"Interests: {', '.join(p['interest_tags'][:6])}")
        for key, val in p.get("answers", {}).items():
            if "excit" in key.lower() or "topic" in key.lower():
                lines.append(f"Excited about: {str(val)[:200]}")
                break
        return "\n".join(lines)

    feature_text = ", ".join(f"{k}: {v:.2f}" for k, v in feature_scores.items())

    # The reader is the signed-in participant looking at their own matches, so
    # address them directly rather than narrating about them in third person.
    from session import CURRENT_USER_ID

    if a["id"] == CURRENT_USER_ID:
        you, them = a, b
    elif b["id"] == CURRENT_USER_ID:
        you, them = b, a
    else:
        you, them = None, None

    if you is not None and them is not None:
        voice = (
            f"You are writing TO {you['name']} about {them['name']}. Use the second "
            f"person throughout: start with \"You and {them['name']}\" or \"You both\", "
            f"and never refer to {you['name']} by name or in the third person. "
            f"Address the icebreaker to {you['name']} as something to ask "
            f"{them['name']}."
        )
    else:
        voice = "Write in the third person about both people."

    prompt = (
        f"Two hackathon participants have a similarity score of {composite_score:.2f}/1.0.\n\n"
        f"Feature scores: {feature_text}\n"
        f"Shared facts: {', '.join(shared_facts) if shared_facts else 'None found'}\n\n"
        f"Person A:\n{profile_summary(a)}\n\n"
        f"Person B:\n{profile_summary(b)}\n\n"
        f"{voice}\n"
        f"Write a 2-3 sentence explanation of why these two would connect well, "
        f"citing ONLY concrete facts from the profiles above. Do NOT invent details.\n"
        f"Also write one specific icebreaker question.\n\n"
        f'Return ONLY valid JSON: {{"explanation": "...", "icebreaker": "..."}}'
    )

    from session import CURRENT_USER_ID as _CUR
    if a["id"] == _CUR:
        explanation = f"You and {b['name']} match across several signals."
    elif b["id"] == _CUR:
        explanation = f"You and {a['name']} match across several signals."
    else:
        explanation = f"{a['name']} and {b['name']} match across several signals." 
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
