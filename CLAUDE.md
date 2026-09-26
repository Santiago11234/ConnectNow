# ConnectNow

Hackathon project for HackGT. Theme to win: "Dive into the depths of data and surface something brilliant through innovative ML/AI and visualization that sees what no one else can."

ConnectNow ingests opt-in participant profiles, computes multi-dimensional similarity between every pair of participants, and renders it as an interactive heat map plus a 2D "constellation" map. Its job is to surface connections people would never find on their own (hidden bridges, complementary teammates, shared-interest strangers).

## Guiding principles
1. Demo-first. Every decision is judged by: does it make the live demo more impressive within the time left? Cut anything that doesn't.
2. Always keep a working end-to-end path. Get the ugly version working first (synthetic data -> similarity -> heat map), then improve it.
3. Explainability is the differentiator. Any score shown must be explainable ("why are these two similar?"). Never show a bare number without a breakdown available on click.
4. Privacy by design. Only use data participants opted in to share. No scraping. Show a consent line on the intake form. Demo uses synthetic data unless real opt-in data exists.
5. Prefer boring, fast tools. No new infrastructure unless it saves time.

## Tech stack
- Frontend: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- Visualization: D3 (scales, clustering helpers) rendering to Canvas for the heat map (SVG is too slow at ~1000x1000); Canvas/WebGL (d3 + canvas or deck.gl) for the UMAP constellation; d3-force for the friend graph
- Backend: Python 3.11 + FastAPI + Uvicorn
- ML: sentence-transformers (`all-MiniLM-L6-v2`, local, free, fast) or a hosted embedding API; scikit-learn; scipy (hierarchical clustering + `optimal_leaf_ordering` for heat map seriation); umap-learn; networkx (graph metrics)
- LLM: Anthropic Claude API for structured extraction (free-text -> interest tags, skills, industries) and for "why are these two similar" explanations and icebreakers. Use the Claude model configured in `.env` (`CLAUDE_MODEL`).
- Storage: SQLite (via SQLModel) for hackathon speed; precomputed matrices cached as `.npy` files. Upgrade to Supabase/Postgres + pgvector only if real multi-user persistence is needed.
- Deploy: Vercel (frontend) + Railway or Render (backend). Local demo is the fallback.

## Repo layout
```
connectnow/
  CLAUDE.md
  PROMPT_PLAN.md
  .env.example
  backend/
    main.py                # FastAPI app
    models.py              # SQLModel tables + pydantic schemas
    ingest.py              # CSV/form ingestion, normalization
    synth.py               # synthetic participant generator
    features/
      university.py
      internships.py
      interests.py         # embeddings + LLM tag extraction
      graph.py             # mutual-friend metrics
      grade.py
    similarity.py          # per-feature matrices + composite
    clustering.py          # seriation order, UMAP coords, communities
    explain.py             # Claude-powered pair explanations
    tests/
  frontend/
    app/                   # routes: /, /explore, /me, /intake
    components/            # Heatmap, Constellation, PairDrawer, WeightSliders
    lib/                   # api client, matrix utils
  data/
    synthetic.json
    cache/                 # .npy matrices, embeddings
```

## Data model (participants)
- id, name, email (optional, hidden by default), school, major, year (grade level), grad_year
- internships: list of {company, role, industry?, year}
- team_id, teammates (ids)
- friends: list of participant ids or names (self-reported "people I know here")
- answers: dict of free-text question -> answer (the intake questions)
- derived (computed, never user-entered): interest_tags, skills, embedding vector, cluster_id, umap_x, umap_y

## Similarity spec
Compute one NxN matrix per feature, each normalized to [0,1], symmetric, diagonal = 1:
- `university`: 1.0 same school; partial credit for same major / same year; optional embedding-based school similarity
- `grade`: 1 - |year_a - year_b| / max_gap
- `internships`: blend of Jaccard on company set + cosine of industry/role embeddings
- `interests`: cosine similarity of embeddings of concatenated free-text answers, plus Jaccard on LLM-extracted tags
- `network`: mutual friends using Adamic-Adar or Jaccard over the friend graph, plus a bonus for "friend of a teammate" (2-hop across teams)

Composite = weighted sum of feature matrices, weights sum to 1, defaults in `similarity.py`.
KEY TRICK: send the per-feature matrices to the browser (quantize to uint8) so the weight sliders recombine them client-side with instant feedback and no round trip.

Also compute:
- Complementarity mode: high interest overlap but different skills/industries (useful for teammate matching)
- Serendipity score: high composite similarity AND large graph distance AND different teams
- Bridge score: people with high betweenness across interest clusters

## Visualization requirements
- Heat map: rows/columns ordered by hierarchical clustering with optimal leaf ordering so that clusters appear as visible blocks. Canvas-rendered. Hover shows pair; click opens a drawer with per-feature contribution breakdown and an LLM-written explanation.
- Constellation: UMAP 2D scatter, color by cluster, size by bridge score, search to highlight a person and their top matches.
- Controls: weight sliders per feature, mode toggle (Similar / Complementary / Serendipity), filter by school/team.
- "Find my people": pick yourself, see your top 10 matches with reasons and an icebreaker.
- Must look great on a projector: dark theme, high contrast, a perceptually uniform colormap (viridis/magma), smooth transitions.

## UI rules (important)
All frontend work MUST follow `.claude/skills/obsidian-ui/SKILL.md`: flat, dense, Obsidian-style dark workspace (three panes, tabs, status bar), a single purple accent, no gradients/glow/emoji/oversized rounding. Restyle shadcn defaults to match. After UI changes, screenshot with Playwright and check against the skill's checklist before reporting done.

## Commands
- Backend: `cd backend && uvicorn main:app --reload --port 8000`
- Frontend: `cd frontend && npm run dev`
- Generate synthetic data: `python backend/synth.py --n 400`
- Tests: `cd backend && pytest -q`
- Lint: `cd frontend && npm run lint`

## Conventions
- Python: type hints, pydantic models at API boundaries, small pure functions in `features/` that take a list of participants and return an NxN numpy array. No global state.
- TypeScript: strict mode, no `any`, components under 200 lines.
- API: JSON, snake_case on the backend, camelCase mapped on the frontend client.
- Cache anything expensive (embeddings, LLM calls) to `data/cache/` keyed by a content hash. Never call the LLM twice for the same input.
- Every LLM call: request structured JSON output, validate with pydantic, and fall back gracefully on failure.
- Secrets only via `.env` (never commit). Keep `.env.example` current.
- Commit small and often with clear messages; the app must run at every commit on main.

## Working style for Claude Code
- Before large changes, state the plan in a few lines, then implement.
- Run the code after writing it. Fix errors yourself before reporting back.
- Ask before adding a new dependency or changing the data model.
- If time is short, prefer the simplest thing that demos well and leave a `TODO:` comment.
- Do not invent participant data in real-data mode. Synthetic data must be clearly flagged (`is_synthetic: true`).

## Definition of done (demo readiness)
1. Loads 400+ participants and renders the heat map in under 2 seconds.
2. Sliders update the map in real time.
3. Clicking any cell explains the match in plain English.
4. "Find my people" works for at least one live volunteer from the audience.
5. A 2-minute scripted demo path works with no errors, with a recorded backup video.
