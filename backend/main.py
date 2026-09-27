import json
import os
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, SQLModel, create_engine, select

# Load .env from repo root (one level up from backend/)
_REPO_ROOT = Path(__file__).parent.parent
load_dotenv(_REPO_ROOT / ".env")

sys.path.insert(0, str(Path(__file__).parent))

from ingest import load_seeds, load_synthetic, participant_to_dict
from models import Participant, ParticipantCreate, ParticipantPublic
import similarity
import clustering
import explain as explain_module
from features import interests as interests_feature

# Resolve DATABASE_URL so it always works regardless of cwd
_DEFAULT_DB = str(_REPO_ROOT / "data" / "connectnow.db")
_RAW_DB_URL = os.environ.get("DATABASE_URL", f"sqlite:///{_DEFAULT_DB}")

# If the URL uses a relative path (e.g. sqlite:///./data/...) anchor it to repo root
if _RAW_DB_URL.startswith("sqlite:///./") or _RAW_DB_URL.startswith("sqlite:///data/"):
    _rel = _RAW_DB_URL.replace("sqlite:///./", "").replace("sqlite:///", "")
    DATABASE_URL = f"sqlite:///{_REPO_ROOT / _rel}"
else:
    DATABASE_URL = _RAW_DB_URL

DATA_DIR = _REPO_ROOT / "data"
CACHE_DIR = DATA_DIR / "cache"

DATA_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(DATABASE_URL)

_matrices: dict = {}
_layout_cache: dict = {}
_participants_cache: list[dict] = []
_openai_client = None


def get_openai_client():
    global _openai_client
    if _openai_client is None:
        api_key = os.environ.get("OPENAI_API_KEY")
        if api_key:
            from openai import OpenAI
            _openai_client = OpenAI(api_key=api_key)
    return _openai_client


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _matrices, _layout_cache, _participants_cache

    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        synthetic_path = DATA_DIR / "synthetic.json"
        n = load_synthetic(session, synthetic_path)
        if n > 0:
            print(f"Loaded {n} synthetic participants")
        seeded = load_seeds(session, DATA_DIR / "seed_profiles.json")
        if seeded > 0:
            print(f"Loaded {seeded} seed profiles (hardcoded cohort)")

    with Session(engine) as session:
        db_participants = session.exec(select(Participant)).all()
        _participants_cache = [participant_to_dict(p) for p in db_participants]

    print(f"Participants loaded: {len(_participants_cache)}")

    client = get_openai_client()
    if client:
        print("Extracting interest tags with OpenAI (cached after first run)...")
        t_tags = time.time()
        tagged = 0
        for i, p in enumerate(_participants_cache):
            if not p.get("interest_tags"):
                try:
                    result = interests_feature.extract_tags_for_participant(p, client)
                    p["interest_tags"] = result.interest_tags
                    tagged += 1
                except Exception as e:
                    print(f"Tag extraction failed for {p['id']}: {e}")
            if (i + 1) % 100 == 0:
                print(f"  Tagged {i + 1}/{len(_participants_cache)}")
        if tagged:
            print(f"  Tagged {tagged} new participants in {time.time() - t_tags:.1f}s")

    print("Computing similarity matrices...")
    t0 = time.time()
    _matrices = similarity.compute_all(_participants_cache)
    print(f"All matrices computed in {time.time() - t0:.2f}s")

    composite_mat = similarity.composite(_matrices)
    print("Computing layout (UMAP + clustering)...")
    t0 = time.time()
    try:
        _layout_cache = clustering.compute_layout(composite_mat, _participants_cache, client)
        print(f"Layout done in {time.time() - t0:.2f}s")
    except Exception as e:
        print(f"Layout computation failed ({e}), using fallback")
        n = len(_participants_cache)
        import math
        _layout_cache = {
            "order": list(range(n)),
            "coords": [
                [float(i % 20) / 20, math.floor(i / 20) / math.ceil(n / 20)]
                for i in range(n)
            ],
            "cluster_ids": [i % 8 for i in range(n)],
            "cluster_labels": {str(i): f"Group {i + 1}" for i in range(8)},
            "bridge_scores": [0.5] * n,
            "participants": [
                {"id": p["id"], "name": p["name"], "school": p["school"], "team_id": p.get("team_id")}
                for p in _participants_cache
            ],
        }

    yield


app = FastAPI(title="ConnectNow API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    with Session(engine) as session:
        count = len(session.exec(select(Participant)).all())
    return {"status": "ok", "participants": count}


@app.get("/participants", response_model=list[ParticipantPublic])
def get_participants():
    result = []
    for p in _participants_cache:
        result.append(
            ParticipantPublic(
                id=p["id"],
                name=p["name"],
                school=p["school"],
                major=p["major"],
                year=p["year"],
                grad_year=p["grad_year"],
                gpa_band=p.get("gpa_band"),
                team_id=p.get("team_id"),
                is_synthetic=p.get("is_synthetic", False),
                internships=p.get("internships", []),
                skills=p.get("skills", []),
                dev_groups=p.get("dev_groups", []),
                hackathons=p.get("hackathons", []),
                involvement=p.get("involvement", []),
                answers=p.get("answers", {}),
                teammates=p.get("teammates", []),
                friends=p.get("friends", []),
                interest_tags=p.get("interest_tags", []),
            )
        )
    return result


@app.post("/participants", response_model=ParticipantPublic)
def create_participant(participant: ParticipantCreate):
    if not participant.consent:
        raise HTTPException(status_code=400, detail="Consent is required")

    import uuid
    new_id = f"u{uuid.uuid4().hex[:8]}"

    with Session(engine) as session:
        db_p = Participant(
            id=new_id,
            name=participant.name,
            email=participant.email,
            school=participant.school,
            major=participant.major,
            year=participant.year,
            grad_year=participant.grad_year,
            is_synthetic=False,
            internships_json=json.dumps(participant.internships),
            skills_json=json.dumps(participant.skills),
            dev_groups_json=json.dumps(participant.dev_groups),
            hackathons_json=json.dumps(participant.hackathons),
            involvement_json=json.dumps(participant.involvement),
            answers_json=json.dumps(participant.answers),
            teammates_json=json.dumps(participant.teammates),
            friends_json=json.dumps(participant.friends),
            interest_tags_json="[]",
        )
        session.add(db_p)
        session.commit()

    return ParticipantPublic(
        id=new_id,
        name=participant.name,
        school=participant.school,
        major=participant.major,
        year=participant.year,
        grad_year=participant.grad_year,
        is_synthetic=False,
        internships=participant.internships,
        skills=participant.skills,
        dev_groups=participant.dev_groups,
        hackathons=participant.hackathons,
        involvement=participant.involvement,
        answers=participant.answers,
        teammates=participant.teammates,
        friends=participant.friends,
    )


@app.get("/matrix")
def get_matrix():
    if not _matrices:
        raise HTTPException(status_code=503, detail="Matrices not yet computed")
    return {
        "participants": [{"id": p["id"], "name": p["name"]} for p in _participants_cache],
        "matrices": {
            name: similarity.quantize_to_uint8(mat) for name, mat in _matrices.items()
        },
        "weights": similarity.DEFAULT_WEIGHTS,
    }


@app.get("/model")
def get_model_metrics():
    """Evaluation for the learned link predictor. Everything here is scored on
    friendships hidden from both message passing and the loss."""
    import gnn

    metrics = gnn.get_metrics()
    if not metrics:
        raise HTTPException(status_code=503, detail="Model not yet trained")
    return {
        "model": "GraphSAGE (2-layer, mean aggregation)",
        "task": "link prediction on the participant friend graph",
        **metrics,
    }


@app.get("/layout")
def get_layout():
    if not _layout_cache:
        raise HTTPException(status_code=503, detail="Layout not yet computed")
    return _layout_cache


@app.post("/layout")
def recompute_layout(weights: dict[str, float]):
    global _layout_cache
    if not _matrices:
        raise HTTPException(status_code=503, detail="Matrices not yet computed")
    composite_mat = similarity.composite(_matrices, weights)
    client = get_openai_client()
    try:
        _layout_cache = clustering.compute_layout(composite_mat, _participants_cache, client)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return _layout_cache


@app.get("/explain")
def get_explanation(a: str = Query(...), b: str = Query(...)):
    id_to_p = {p["id"]: p for p in _participants_cache}
    if a not in id_to_p:
        raise HTTPException(status_code=404, detail=f"Participant {a} not found")
    if b not in id_to_p:
        raise HTTPException(status_code=404, detail=f"Participant {b} not found")

    pa, pb = id_to_p[a], id_to_p[b]
    id_list = [p["id"] for p in _participants_cache]
    idx_a, idx_b = id_list.index(a), id_list.index(b)

    feature_scores = {name: float(mat[idx_a, idx_b]) for name, mat in _matrices.items()}
    composite_mat = similarity.composite(_matrices)
    composite_score = float(composite_mat[idx_a, idx_b])

    client = get_openai_client()
    if not client:
        return {
            "participant_a": {
                "id": a,
                "name": pa["name"],
                "school": pa["school"],
                "major": pa["major"],
                "year": pa["year"],
                "interests": "",
            },
            "participant_b": {
                "id": b,
                "name": pb["name"],
                "school": pb["school"],
                "major": pb["major"],
                "year": pb["year"],
                "interests": "",
            },
            "composite_score": composite_score,
            "feature_scores": feature_scores,
            "explanation": f"{pa['name']} and {pb['name']} share strong similarities.",
            "icebreaker": "What are you hoping to build this weekend?",
            "shared_facts": explain_module._shared_facts(pa, pb),
        }

    return explain_module.explain_pair(pa, pb, feature_scores, composite_score, client)
