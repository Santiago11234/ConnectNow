import json
from pathlib import Path
from sqlmodel import Session, select
from models import Participant


def participant_to_dict(p: Participant) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "email": p.email,
        "school": p.school,
        "major": p.major,
        "year": p.year,
        "grad_year": p.grad_year,
        "gpa_band": p.gpa_band,
        "team_id": p.team_id,
        "is_synthetic": p.is_synthetic,
        "internships": json.loads(p.internships_json),
        "skills": json.loads(p.skills_json),
        "dev_groups": json.loads(p.dev_groups_json),
        "hackathons": json.loads(p.hackathons_json),
        "involvement": json.loads(p.involvement_json),
        "answers": json.loads(p.answers_json),
        "teammates": json.loads(p.teammates_json),
        "friends": json.loads(p.friends_json),
        "interest_tags": json.loads(p.interest_tags_json),
        "latent_archetype": p.latent_archetype,
    }


def load_seeds(session: Session, data_path: Path) -> int:
    """Hardcoded cohort (real named people plus their immediate neighbourhood).

    Kept separate from the generated data and upserted on every boot, so the
    demo's own profiles survive a `synth.py` regeneration.
    """
    if not data_path.exists():
        return 0
    participants = json.loads(data_path.read_text())["participants"]
    existing = {p.id for p in session.exec(select(Participant)).all()}
    added = 0
    for p in participants:
        if p["id"] in existing:
            continue
        session.add(_to_row(p))
        added += 1
    if added:
        session.commit()
    return added


def _to_row(p: dict) -> Participant:
    return Participant(
        id=p["id"],
        name=p["name"],
        email=p.get("email"),
        school=p["school"],
        major=p["major"],
        year=p["year"],
        grad_year=p["grad_year"],
        gpa_band=p.get("gpa_band"),
        team_id=p.get("team_id"),
        is_synthetic=p.get("is_synthetic", False),
        internships_json=json.dumps(p.get("internships", [])),
        skills_json=json.dumps(p.get("skills", [])),
        dev_groups_json=json.dumps(p.get("dev_groups", [])),
        hackathons_json=json.dumps(p.get("hackathons", [])),
        involvement_json=json.dumps(p.get("involvement", [])),
        answers_json=json.dumps(p.get("answers", {})),
        teammates_json=json.dumps(p.get("teammates", [])),
        friends_json=json.dumps(p.get("friends", [])),
        interest_tags_json=json.dumps([]),
        latent_archetype=p.get("latent_archetype"),
    )


def load_synthetic(session: Session, data_path: Path) -> int:
    existing = session.exec(select(Participant)).first()
    if existing:
        return 0

    data = json.loads(data_path.read_text())
    participants = data["participants"]

    for p in participants:
        db_p = Participant(
            id=p["id"],
            name=p["name"],
            email=p.get("email"),
            school=p["school"],
            major=p["major"],
            year=p["year"],
            grad_year=p["grad_year"],
            gpa_band=p.get("gpa_band"),
            team_id=p.get("team_id"),
            is_synthetic=p.get("is_synthetic", False),
            internships_json=json.dumps(p.get("internships", [])),
            skills_json=json.dumps(p.get("skills", [])),
            dev_groups_json=json.dumps(p.get("dev_groups", [])),
            hackathons_json=json.dumps(p.get("hackathons", [])),
            involvement_json=json.dumps(p.get("involvement", [])),
            answers_json=json.dumps(p.get("answers", {})),
            teammates_json=json.dumps(p.get("teammates", [])),
            friends_json=json.dumps(p.get("friends", [])),
            interest_tags_json=json.dumps([]),
            latent_archetype=p.get("latent_archetype"),
        )
        session.add(db_p)
    session.commit()
    return len(participants)
