# ConnectNow

Surfaces hidden connections between hackathon participants using ML/AI and interactive visualization. Built for HackGT.

## Quick Start

### 1. Copy and configure environment
```bash
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

### 2. Generate synthetic data (already done — 400 participants in data/synthetic.json)
```bash
python backend/synth.py --n 400
```

### 3. Start the backend
```bash
cd backend && uvicorn main:app --reload --port 8000
```

### 4. Start the frontend
```bash
cd frontend && npm run dev
```

## Backend Commands

| Command | Description |
|---------|-------------|
| `cd backend && uvicorn main:app --reload --port 8000` | Start API server |
| `python backend/synth.py --n 400` | Generate 400 synthetic participants |
| `cd backend && python -m pytest tests/ -v` | Run tests |
| `cd frontend && npm run lint` | Lint frontend |

## API Endpoints

- `GET /health` — health check + participant count
- `GET /participants` — list all participants (no sensitive fields)
- `POST /participants` — intake form submission (requires consent)
- `GET /matrix` — all feature matrices (uint8-quantized) + default weights
- `GET /layout` — UMAP coords, cluster ids, bridge scores
- `POST /layout` — recompute layout with custom weights
- `GET /explain?a={id}&b={id}` — LLM explanation + icebreaker for a pair

## Architecture

```
backend/
  main.py           FastAPI app + lifespan startup
  models.py         SQLModel tables + Pydantic schemas
  ingest.py         Load synthetic/real data into SQLite
  synth.py          Synthetic participant generator
  similarity.py     Composite NxN matrix + quantization
  clustering.py     UMAP, seriation, clusters, bridge scores
  explain.py        Claude-powered pair explanations
  features/
    university.py   Same school/major/year scoring
    grade.py        Year-level proximity
    internships.py  Jaccard on companies + industries
    interests.py    Sentence-transformer embeddings + tag Jaccard
    graph.py        Mutual-friend network (resource allocation index)
  tests/
    test_similarity.py
```

## Notes

- LLM features (tag extraction, explanations, cluster labels) are skipped gracefully if `ANTHROPIC_API_KEY` is not set.
- All expensive computations (embeddings, LLM calls) are cached to `data/cache/` keyed by content hash.
- The `latent_archetype` field on synthetic participants is ground-truth validation only — never used as a model feature or returned by the API.
