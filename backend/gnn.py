"""GraphSAGE link prediction over the participant friend graph.

The other feature modules in `features/` score pairs with fixed rules. This one
*learns* a representation: a 2-layer GraphSAGE encoder is trained to predict
held-out friendships from content features alone, so the resulting embedding
fuses "what you wrote" with "who you know" instead of summing them separately.

Two properties matter for the demo:
  - Cold start. Node features carry no friend-graph information, so a
    participant who listed zero friends still gets a meaningful embedding.
  - Honest evaluation. 20% of real edges are hidden from message passing *and*
    from the loss, then recovered. The reported AUC is on those hidden edges.

Written against raw torch (no torch-geometric) - at n<=2000 a dense normalized
adjacency is faster than any sparse gather, and it keeps the dependency list
unchanged.
"""

import hashlib
import json
from pathlib import Path
from typing import Optional

import numpy as np

CACHE_DIR = Path(__file__).parent.parent / "data" / "cache"

EMBED_DIM = 64
HIDDEN_DIM = 128
EPOCHS = 300
LR = 0.01
WEIGHT_DECAY = 5e-4
TEST_FRAC = 0.2
VAL_FRAC = 0.1
SEED = 42


# ---------------------------------------------------------------------------
# Node features (content only - never any friend-graph signal)
# ---------------------------------------------------------------------------
def _one_hot(values: list[str], vocab: Optional[list[str]] = None) -> np.ndarray:
    if vocab is None:
        vocab = sorted({v for v in values if v})
    index = {v: i for i, v in enumerate(vocab)}
    mat = np.zeros((len(values), len(vocab)), dtype=np.float32)
    for i, v in enumerate(values):
        j = index.get(v)
        if j is not None:
            mat[i, j] = 1.0
    return mat


YEAR_NUM = {"Freshman": 1, "Sophomore": 2, "Junior": 3, "Senior": 4, "Master's": 5, "PhD": 6}


def build_node_features(participants: list[dict]) -> np.ndarray:
    """Content features only. Anything derived from `friends` would leak."""
    from features import interests as interests_feature

    n = len(participants)
    text_emb = interests_feature._load_or_compute_embeddings(participants)
    text_emb = np.asarray(text_emb, dtype=np.float32)
    norms = np.maximum(np.linalg.norm(text_emb, axis=1, keepdims=True), 1e-8)
    text_emb = text_emb / norms

    school = _one_hot([p.get("school", "") for p in participants])
    major = _one_hot([p.get("major", "") for p in participants])

    year = np.array(
        [[YEAR_NUM.get(p.get("year", ""), 3) / 6.0] for p in participants], dtype=np.float32
    )

    industry_vocab = sorted(
        {
            i.get("industry", "")
            for p in participants
            for i in p.get("internships", [])
            if i.get("industry")
        }
    )
    industry = np.zeros((n, len(industry_vocab)), dtype=np.float32)
    ind_index = {v: i for i, v in enumerate(industry_vocab)}
    for i, p in enumerate(participants):
        for internship in p.get("internships", []):
            j = ind_index.get(internship.get("industry", ""))
            if j is not None:
                industry[i, j] = 1.0

    n_internships = np.array(
        [[min(len(p.get("internships", [])), 5) / 5.0] for p in participants], dtype=np.float32
    )

    # Campus signals. Multi-hot rather than one-hot - people belong to several.
    campus = [
        _multi_hot([p.get(field, []) for p in participants])
        for field in ("dev_groups", "hackathons", "involvement")
    ]

    return np.hstack(
        [text_emb, school, major, year, industry, n_internships, *campus]
    ).astype(np.float32)


def _multi_hot(value_lists: list[list[str]]) -> np.ndarray:
    vocab = sorted({v for values in value_lists for v in values})
    index = {v: i for i, v in enumerate(vocab)}
    mat = np.zeros((len(value_lists), len(vocab)), dtype=np.float32)
    for i, values in enumerate(value_lists):
        for v in values:
            j = index.get(v)
            if j is not None:
                mat[i, j] = 1.0
    return mat


# ---------------------------------------------------------------------------
# Edge handling
# ---------------------------------------------------------------------------
def _edge_set(participants: list[dict]) -> set[tuple[int, int]]:
    idx = {p["id"]: i for i, p in enumerate(participants)}
    edges = set()
    for i, p in enumerate(participants):
        for friend_id in p.get("friends", []):
            j = idx.get(friend_id)
            if j is not None and i != j:
                edges.add((min(i, j), max(i, j)))
    return edges


def _sample_negatives(
    n: int, count: int, forbidden: set[tuple[int, int]], rng: np.random.Generator
) -> np.ndarray:
    """Uniform non-edges. Excludes *all* real edges so no true friendship is
    ever handed to the model as a negative."""
    out: set[tuple[int, int]] = set()
    guard = 0
    while len(out) < count and guard < count * 200:
        guard += 1
        i, j = int(rng.integers(0, n)), int(rng.integers(0, n))
        if i == j:
            continue
        pair = (min(i, j), max(i, j))
        if pair in forbidden or pair in out:
            continue
        out.add(pair)
    return np.array(sorted(out), dtype=np.int64)


def _normalized_adjacency(n: int, edges: np.ndarray) -> np.ndarray:
    """Symmetric adjacency with self-loops, row-normalized for mean aggregation."""
    A = np.zeros((n, n), dtype=np.float32)
    if len(edges):
        A[edges[:, 0], edges[:, 1]] = 1.0
        A[edges[:, 1], edges[:, 0]] = 1.0
    np.fill_diagonal(A, 1.0)
    deg = np.maximum(A.sum(axis=1, keepdims=True), 1.0)
    return A / deg


# ---------------------------------------------------------------------------
# Model
# ---------------------------------------------------------------------------
def _build_model(in_dim: int):
    import torch
    import torch.nn as nn

    class SAGELayer(nn.Module):
        """h' = W_self h + W_neigh (A_norm h)  - mean aggregation over neighbours."""

        def __init__(self, fan_in: int, fan_out: int):
            super().__init__()
            self.self_lin = nn.Linear(fan_in, fan_out)
            self.neigh_lin = nn.Linear(fan_in, fan_out, bias=False)

        def forward(self, h, a_norm):
            return self.self_lin(h) + self.neigh_lin(a_norm @ h)

    class GraphSAGE(nn.Module):
        def __init__(self, fan_in: int, hidden: int, out: int):
            super().__init__()
            self.l1 = SAGELayer(fan_in, hidden)
            self.l2 = SAGELayer(hidden, out)
            self.dropout = nn.Dropout(0.2)
            # Embeddings stay on the unit sphere so the exported matrix is a
            # true cosine similarity. That caps the decoder's dot product at
            # [-1,1], which is far too narrow for BCE to ever be confident -
            # without a temperature the model collapses every pair to ~1.0 to
            # drag positives up. These two make the logit range learnable.
            self.logit_scale = nn.Parameter(torch.tensor(10.0))
            self.logit_bias = nn.Parameter(torch.tensor(0.0))

        def forward(self, x, a_norm):
            h = torch.relu(self.l1(x, a_norm))
            h = self.dropout(h)
            h = self.l2(h, a_norm)
            return torch.nn.functional.normalize(h, p=2, dim=1)

        def score(self, z, pairs):
            cos = (z[pairs[:, 0]] * z[pairs[:, 1]]).sum(dim=1)
            return self.logit_scale * cos + self.logit_bias

    return GraphSAGE(in_dim, HIDDEN_DIM, EMBED_DIM)


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------
def train_embeddings(participants: list[dict], verbose: bool = True) -> tuple[np.ndarray, dict]:
    import torch
    from sklearn.metrics import roc_auc_score

    torch.manual_seed(SEED)
    rng = np.random.default_rng(SEED)

    n = len(participants)
    all_edges = _edge_set(participants)
    if len(all_edges) < 20:
        raise ValueError(f"friend graph too sparse to train on ({len(all_edges)} edges)")

    # Three-way split. Early stopping picks its epoch on val; test is scored
    # once at the end. Selecting the epoch on test would inflate the headline
    # number, which is exactly the thing a judge will ask about.
    edge_arr = np.array(sorted(all_edges), dtype=np.int64)
    perm = rng.permutation(len(edge_arr))
    n_test = max(1, int(len(edge_arr) * TEST_FRAC))
    n_val = max(1, int(len(edge_arr) * VAL_FRAC))
    test_pos = edge_arr[perm[:n_test]]
    val_pos = edge_arr[perm[n_test : n_test + n_val]]
    train_pos = edge_arr[perm[n_test + n_val :]]

    # Message passing sees train edges only - val and test edges are invisible
    # to the encoder as well as to the loss.
    a_norm = torch.from_numpy(_normalized_adjacency(n, train_pos))

    x = torch.from_numpy(build_node_features(participants))
    model = _build_model(x.shape[1])
    opt = torch.optim.Adam(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)
    loss_fn = torch.nn.BCEWithLogitsLoss()

    def eval_set(pos: np.ndarray) -> tuple:
        neg = _sample_negatives(n, len(pos), all_edges, rng)
        pairs = torch.from_numpy(np.vstack([pos, neg]))
        labels = np.concatenate([np.ones(len(pos)), np.zeros(len(neg))])
        return pairs, labels

    val_pairs, val_labels = eval_set(val_pos)
    test_pairs, test_labels = eval_set(test_pos)

    train_pos_t = torch.from_numpy(train_pos)
    history = []
    best_val, best_z, best_epoch = 0.0, None, 0

    for epoch in range(EPOCHS):
        model.train()
        opt.zero_grad()

        # Resample negatives every epoch so the model sees the whole non-edge space.
        neg = torch.from_numpy(_sample_negatives(n, len(train_pos), all_edges, rng))
        z = model(x, a_norm)
        logits = torch.cat([model.score(z, train_pos_t), model.score(z, neg)])
        labels = torch.cat([torch.ones(len(train_pos_t)), torch.zeros(len(neg))])
        loss = loss_fn(logits, labels)
        loss.backward()
        opt.step()

        if (epoch + 1) % 10 == 0 or epoch == 0:
            model.eval()
            with torch.no_grad():
                z_eval = model(x, a_norm)
                val_auc = float(roc_auc_score(val_labels, model.score(z_eval, val_pairs).numpy()))
            history.append({"epoch": epoch + 1, "loss": float(loss.item()), "val_auc": val_auc})
            if val_auc > best_val:
                best_val, best_epoch = val_auc, epoch + 1
                best_z = z_eval.numpy().copy()
            if verbose and (epoch + 1) % 50 == 0:
                print(f"    epoch {epoch + 1:3d}  loss {loss.item():.4f}  val AUC {val_auc:.3f}")

    if best_z is None:
        model.eval()
        with torch.no_grad():
            best_z = model(x, a_norm).numpy()

    # Single scoring of the untouched test edges, using the val-selected epoch.
    with torch.no_grad():
        z_best = torch.from_numpy(best_z)
        test_auc = float(roc_auc_score(test_labels, model.score(z_best, test_pairs).numpy()))

    metrics = {
        "held_out_auc": test_auc,
        "val_auc": best_val,
        "best_epoch": best_epoch,
        "precision_at_10": _precision_at_k(best_z, participants, all_edges, k=10),
        "archetype_purity": _archetype_purity(best_z, participants),
        "text_archetype_purity": _archetype_purity(
            x[:, :384].numpy().astype(np.float32), participants
        ),
        "baselines": _structural_baselines(n, train_pos, test_pairs.numpy(), test_labels),
        "n_edges": len(all_edges),
        "n_train_edges": int(len(train_pos)),
        "n_val_edges": int(len(val_pos)),
        "n_test_edges": int(len(test_pos)),
        "embed_dim": EMBED_DIM,
        "input_dim": int(x.shape[1]),
        "epochs": EPOCHS,
        "history": history,
    }
    return best_z.astype(np.float32), metrics


def _structural_baselines(
    n: int, train_pos: np.ndarray, test_pairs: np.ndarray, test_labels: np.ndarray
) -> dict:
    """Classical link predictors on the same split, so the GNN's number is
    quotable as a comparison rather than in isolation."""
    import networkx as nx
    from sklearn.metrics import roc_auc_score

    G = nx.Graph()
    G.add_nodes_from(range(n))
    G.add_edges_from(map(tuple, train_pos))
    ebunch = [tuple(p) for p in test_pairs]

    out = {}
    for name, fn in [
        ("adamic_adar", nx.adamic_adar_index),
        ("resource_allocation", nx.resource_allocation_index),
        ("jaccard", nx.jaccard_coefficient),
    ]:
        try:
            scores = np.array([v for _, _, v in fn(G, ebunch)])
            out[name] = float(roc_auc_score(test_labels, scores))
        except Exception as e:
            out[name] = None
            print(f"    baseline {name} failed: {e}")
    return out


def _precision_at_k(z: np.ndarray, participants: list[dict], edges: set, k: int = 10) -> float:
    """Of each person's top-k predicted connections, what fraction are real
    friends? Existing friends are left in the candidate pool here on purpose -
    this measures ranking quality, not recommendation novelty."""
    n = len(participants)
    sim = z @ z.T
    np.fill_diagonal(sim, -np.inf)
    neighbours = {i: set() for i in range(n)}
    for i, j in edges:
        neighbours[i].add(j)
        neighbours[j].add(i)

    hits, total = 0, 0
    for i in range(n):
        if not neighbours[i]:
            continue
        top = np.argpartition(-sim[i], k)[:k]
        hits += sum(1 for j in top if j in neighbours[i])
        total += k
    return float(hits / total) if total else 0.0


def _archetype_purity(z: np.ndarray, participants: list[dict]) -> Optional[float]:
    """Does the learned space recover the hidden generator? `latent_archetype`
    is never a model input, so this is a clean structure-recovery check.
    Returns None on real data, where no such ground truth exists.

    Note: the raw MiniLM text embedding scores ~0.99 here and the GNN scores
    lower, because the GNN is optimised for friendship (heavily school-driven)
    rather than for topic. Archetype recovery is a sentence-transformer result,
    not a GNN one - see `text_archetype_purity` in the metrics."""
    labels = [p.get("latent_archetype") for p in participants]
    if any(l is None for l in labels):
        return None
    sim = z @ z.T
    np.fill_diagonal(sim, -np.inf)
    nearest = np.argmax(sim, axis=1)
    return float(np.mean([labels[i] == labels[nearest[i]] for i in range(len(labels))]))


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def _cache_key(participants: list[dict]) -> str:
    payload = json.dumps(
        [
            {
                "id": p["id"],
                "school": p.get("school"),
                "major": p.get("major"),
                "year": p.get("year"),
                "friends": sorted(p.get("friends", [])),
                "answers": p.get("answers", {}),
            }
            for p in participants
        ],
        sort_keys=True,
    )
    config = f"{EMBED_DIM}-{HIDDEN_DIM}-{EPOCHS}-{LR}-{TEST_FRAC}-{SEED}"
    return hashlib.sha256((payload + config).encode()).hexdigest()[:16]


_last_metrics: dict = {}


def get_metrics() -> dict:
    return _last_metrics


def compute(participants: list[dict]) -> np.ndarray:
    """NxN learned-similarity matrix in [0,1]. Falls back to zeros (a no-op in
    the weighted sum) if training is impossible, so the demo never hard-fails."""
    global _last_metrics
    n = len(participants)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    key = _cache_key(participants)
    emb_path = CACHE_DIR / f"gnn_emb_{key}.npy"
    met_path = CACHE_DIR / f"gnn_metrics_{key}.json"

    try:
        if emb_path.exists() and met_path.exists():
            z = np.load(str(emb_path))
            _last_metrics = json.loads(met_path.read_text())
            print("  (loaded trained GNN from cache)")
        else:
            print("  training GraphSAGE link predictor...")
            z, _last_metrics = train_embeddings(participants)
            np.save(str(emb_path), z)
            met_path.write_text(json.dumps(_last_metrics))
            print(
                f"    -> held-out AUC {_last_metrics['held_out_auc']:.3f}, "
                f"P@10 {_last_metrics['precision_at_10']:.3f}, "
                f"archetype purity {_last_metrics['archetype_purity']}"
            )
    except Exception as e:
        print(f"  GNN training failed ({e}); contributing zeros to the composite")
        _last_metrics = {"error": str(e), "held_out_auc": None}
        return np.zeros((n, n), dtype=np.float32)

    # Embeddings are L2-normalized, so this is cosine; map [-1,1] -> [0,1].
    sim = ((z @ z.T) + 1.0) / 2.0
    np.fill_diagonal(sim, 1.0)
    return np.clip(sim, 0.0, 1.0).astype(np.float32)
