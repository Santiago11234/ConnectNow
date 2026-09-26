# ConnectNow Prompt Plan

Use with Claude Code in the repo root (CLAUDE.md is auto-loaded). Paste one prompt at a time, run the app, verify, commit, then move on. Time budgets assume roughly 12-16 focused hours; scale down as needed. If you fall behind, skip anything marked OPTIONAL.

Rule of thumb: after every phase, the app must run end to end.

---

## Phase 0: Scaffold (30 min)
Prompt:
```
Read CLAUDE.md. Scaffold the repo exactly per the layout: a FastAPI backend with a /health endpoint and CORS enabled for localhost:3000, and a Next.js + TypeScript + Tailwind + shadcn/ui frontend with a dark theme. Add .env.example, a root README with run commands, and make sure both servers start. Show the frontend fetching /health from the backend on the home page.
```
Checkpoint: both servers run, home page shows backend status.

## Phase 1: Data layer + intake (45 min)
backend/synth.py and data/synthetic.json already exist (400 flagged-synthetic participants, no API key needed; regenerate with `python backend/synth.py --n 400 --seed 42`). Do not rewrite them.
Prompt:
```
Read CLAUDE.md and backend/synth.py. Add SQLModel tables matching the participant schema in data/synthetic.json (keep is_synthetic and latent_archetype; latent_archetype must never be used as a model feature). Write ingest.py to load data/synthetic.json into SQLite on startup if the table is empty. Add GET /participants and POST /participants (consent required), and a /intake page with a form (including a consent checkbox) that submits a participant. Verify the API returns all 400.
```
Checkpoint: 400 synthetic participants load; intake form saves a new one.

## Phase 2: Similarity engine (90 min)
Prompt:
```
Implement backend/features/* and backend/similarity.py per the Similarity spec in CLAUDE.md. Each feature module exposes a pure function returning an NxN float32 numpy matrix in [0,1]. Use sentence-transformers all-MiniLM-L6-v2 for interest embeddings and cache embeddings by content hash. Use networkx for the friend graph (Adamic-Adar, normalized, plus a 2-hop cross-team bonus). Add composite(weights) and expose GET /matrix returning the per-feature matrices quantized to uint8 plus the participant order and metadata. Write pytest tests for symmetry, range, diagonal, and a few hand-checked pairs. Print timing for N=400 and N=1000.
```
Checkpoint: tests pass; N=1000 computes in a reasonable time.

## Phase 3: LLM extraction (45 min)
Prompt:
```
Implement backend/features/interests.py LLM extraction: for each participant, call Claude once (batched and cached) to convert their free-text answers into structured JSON: interest_tags (max 8, normalized lowercase), skills (max 6), and domains (max 3). Validate with pydantic, fall back to empty lists on failure. Add tag Jaccard into the interests similarity blend. Add a script to backfill all participants and report failures.
```
Checkpoint: participants have clean tags; interests similarity improves on eyeball checks.

## Phase 4: Clustering + layout (45 min)
Prompt:
```
Implement backend/clustering.py: (1) hierarchical clustering on the composite distance with scipy, using optimal_leaf_ordering to produce a seriation order; (2) UMAP 2D coordinates from the composite distance matrix (precomputed metric); (3) community detection (Leiden or agglomerative cut) for cluster_id with an LLM-generated 2-4 word label per cluster; (4) bridge score via betweenness across clusters. Expose GET /layout returning order, coords, cluster ids and labels, bridge scores. Recompute on weight change via POST /layout with weights.
```
Checkpoint: /layout returns sensible clusters with readable labels.

## Phase 5: Heat map (90 min)
Prompt:
```
Build the /explore page with a Canvas-rendered heat map component. Fetch /matrix and /layout, decode the uint8 matrices, and combine them client-side using per-feature weights from sliders (instant updates, no server call). Order rows/columns by the seriation order. Use a viridis-style colormap, draw cluster boundaries and labels along the axes, support hover tooltips (both names, score) and click to select a pair. Handle 1000x1000 smoothly with devicePixelRatio scaling and offscreen ImageData rendering. Add zoom/pan.
```
Checkpoint: heat map shows visible blocks; sliders visibly shift it.

## Phase 6: Explanation drawer (45 min)
Prompt:
```
Add GET /explain?a=&b= in backend/explain.py. Return per-feature scores and contribution to the composite, plus a Claude-written 2-3 sentence explanation of why these two people would click, citing concrete shared facts (companies, school, tags, mutual connections) and one suggested icebreaker. Cache by pair. In the frontend, build a PairDrawer opened by clicking a heat map cell: show a radial/bar breakdown of feature contributions, the explanation, the icebreaker, and the shared facts as chips. Use only facts present in the data; instruct the model not to invent details.
```
Checkpoint: clicking any cell yields a grounded explanation.

## Phase 7: Constellation view (60 min)
Prompt:
```
Build a Constellation component (Canvas or deck.gl) that plots UMAP coords, colored by cluster, sized by bridge score, with cluster labels floating over centroids. Add search-to-highlight, which draws lines to that person's top 10 matches, and link selection between the heat map and constellation (selecting in one highlights in the other). Add smooth animated transitions when weights change and layout recomputes.
```
Checkpoint: two linked views working together.

## Phase 8: Modes + Find my people (60 min)
Prompt:
```
Add a mode toggle: Similar, Complementary, Serendipity (definitions in CLAUDE.md), implemented as different combination functions over the per-feature matrices, computed client-side where possible. Add a /me flow: select yourself (or search your name), see your top 10 matches for the current mode with a one-line reason each, cross-team filter, and a "generate icebreaker" button. Add a "Hidden bridges" panel listing the top 5 bridge people with their cluster connections.
```
Checkpoint: the story "here's who you should meet" works live.

## Phase 9: Polish for judges (90 min)
Prompt:
```
Polish for a projector demo: landing page with a one-line pitch, animated intro that builds the heat map from unordered noise into ordered clusters (the reveal moment), consistent dark theme, loading states, and error handling. Add a "Demo mode" button that auto-runs a scripted tour: reveal, adjust weights, click a surprising pair, jump to constellation, run Find my people. Make sure everything works offline from cached data in case venue Wi-Fi fails.
```
Checkpoint: the scripted tour runs cleanly start to finish.

## Phase 10 (OPTIONAL): Real-data + extras
- Team-builder: suggest a 4-person team maximizing complementary skills with shared interest.
- Export "my matches" as a shareable card.
- "What no one else can see": LLM-generated insights panel (e.g., "the strongest hidden bridge at HackGT is X between the ML and hardware clusters").

## Phase 11: Ship (60 min)
Prompt:
```
Prepare submission: deploy the frontend to Vercel and the backend to Railway/Render with env vars documented; write a README with architecture diagram, ML approach, and privacy statement; write tests to ensure core endpoints run; record a 2-minute backup demo video script with timestamps; and give me a Devpost description hitting the theme: data depth, innovative ML/AI, and visualization that reveals hidden structure.
```

---

## Demo script (2 minutes)
1. (0:00) Hook: "There are 800 people in this room and you'll meet maybe 10. ConnectNow finds the 10 you should."
2. (0:15) Show unordered noise, then animate into clustered heat map: "This is everyone at HackGT compared to everyone."
3. (0:35) Drag sliders: show clusters reshuffle with network vs interests.
4. (0:55) Click a surprising pair: show the grounded explanation and icebreaker.
5. (1:15) Constellation view: point out a hidden bridge person.
6. (1:35) Find my people live with an audience volunteer.
7. (1:50) Close: privacy-first, opt-in, explainable, "sees what no one else can."

## Judging alignment
- Depth of data: five signal types fused, plus graph structure.
- Innovative ML/AI: embeddings + LLM extraction + graph metrics + seriation + UMAP + grounded LLM explanations.
- Visualization: seriated heat map, linked constellation, real-time reweighting.
- Sees what no one else can: hidden bridges, serendipity scores, complementarity mode.

## Risks and mitigations
- Real data unavailable: use synthetic (flagged) plus live opt-in.
- LLM latency: cache everything, precompute explanations for top pairs.
- Performance: uint8 matrices, Canvas, client-side recombination.
- Privacy concerns: consent checkbox, opt-in only, hide emails, allow removal.
