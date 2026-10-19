# 01 — Architecture

> Status: **PROPOSED** (Gate G0)

## 1. Topology

Two planes, joined only by an outbound-only Cloudflare Tunnel.

- **Control plane (Cloudflare)** — identity, policy, orchestration state,
  approvals, metadata, audit, UI. Holds *no restricted content* (CUI / PHI /
  classified) at rest.
- **Data plane (on-prem GPU host / customer enclave)** — models, embeddings,
  vector index for restricted data, training, scoring, document parsing.

```mermaid
flowchart TB
  subgraph Users
    U[Forge staff / customer users]
    P[Forge products<br/>CanaPoint, ForgeComply 360]
  end

  subgraph CF[Cloudflare edge — control plane]
    ACC[Cloudflare Access<br/>IdP + groups]
    DASH[Dashboard<br/>React / Workers static assets]
    GW[Gateway Worker<br/>auth → classify → rbac → rate-limit → audit]
    WF[Workflows + Durable Objects<br/>agent runs, approvals, ingestion jobs]
    Q[Queues<br/>ingest, export, eval]
    PG[(Postgres via Hyperdrive<br/>managed, US region<br/>metadata, audit, approvals)]
    R2[(R2<br/>uploads quarantine, datasets,<br/>artifacts, evidence bundles)]
    KV[(KV<br/>rate limit, cache)]
    VEC[(Vectorize<br/>public + internal only)]
    WAI[Workers AI<br/>generation, embeddings, rerank<br/>public + internal only]
  end

  subgraph OP[On-prem — data plane]
    CFD[cloudflared<br/>outbound only]
    LLM[LiteLLM router]
    VLLM[vLLM / Ollama<br/>generative + vision models]
    EMB[Embedding + reranker service]
    QD[(Qdrant<br/>restricted vectors)]
    PARSE[Parser / OCR<br/>Docling, Tesseract]
    RULES[Rules engine<br/>OSCAL 800-53]
    SCORE[Predictive scorer<br/>FastAPI + LightGBM]
    TRAIN[Training worker<br/>QLoRA, eval, red-team]
    MLF[MLflow<br/>experiments + registry]
    MINIO[(MinIO<br/>restricted object store)]
  end

  U --> ACC --> DASH --> GW
  P -->|service token| GW
  GW --> PG & KV & R2 & VEC
  GW -->|public / internal| WAI
  GW --> WF --> Q
  GW ==>|Tunnel: restricted + own models| CFD
  CFD --> LLM --> VLLM
  CFD --> EMB & PARSE & RULES & SCORE & MLF
  EMB --> QD
  TRAIN --> MLF
  TRAIN --> MINIO
  PARSE --> MINIO
```

## 2. Components

### 2.1 Control plane (Cloudflare)

| Component | New / existing | Responsibility |
|---|---|---|
| Gateway Worker (`worker/`) | Existing, extended | Single external surface. Adds routes `/api/knowledge/*`, `/api/datasets/*`, `/api/agents/*`, `/api/approvals/*`, `/api/predict/*`, `/api/training/*`, `/api/analyze/*`. Every route passes through the existing `authenticate` → `hasPermission` → rate limit → `logAuditEvent` pipeline in `worker/src/index.ts`. |
| Cloudflare Workflows | New | Durable, resumable multi-step runs (agent runs, ingestion, training orchestration). Native `step.waitForEvent()` is how a run **pauses for human approval**. |
| Durable Objects | New | Per-run coordination + live status stream (WebSocket) to the dashboard; per-tenant serialization of approvals. |
| Queues | New | Fan-out for ingestion chunks, eval batches, large ConMon exports (existing TODO). |
| Postgres (managed, US region) via **Hyperdrive** | New — replaces D1 ([ADR-0007](../adr/0007-postgres-via-hyperdrive.md)) | Metadata, audit, approvals only. Existing D1 tables migrate in Phase 0.5; new tables in [`03`](03-agents-and-governance.md#6-proposed-postgres-schema-draft). |
| R2 | Existing (`MODEL_BUCKET`), + new `DATA_BUCKET` | `quarantine/`, `datasets/`, `evidence/` prefixes for **public / internal** data; restricted data is never written here (see §4). |
| Vectorize | New | Vector index for `public` and `internal` knowledge only. |
| KV | Existing (`INFERENCE_CACHE`) | Rate-limit counters, short-lived caches. Never caches restricted prompts or outputs. |
| Dashboard (`dashboard/`) | Existing, extended | New pages: Knowledge, Datasets, Agents, Approvals Inbox, Predictions, Training, Evaluations. |

### 2.2 Data plane (on-prem, `docker-compose.yml`)

| Service | New / existing | Responsibility |
|---|---|---|
| `cloudflared` | Existing | Outbound-only tunnel; one ingress hostname per service. |
| `litellm` | Existing | One OpenAI-compatible router for all chat, vision, and embedding models. |
| `ollama` | Existing | Dev / small-footprint serving. |
| `vllm` | New | Production serving (batching, higher throughput). See [ADR-0001](../adr/0001-model-serving-vllm-and-ollama.md). |
| `embedder` | New | Text embeddings + cross-encoder reranker (e.g. `bge-m3`, `bge-reranker`), exposed via LiteLLM `/v1/embeddings`. |
| `qdrant` | New | Vector store for `cui` / `phi` / `classified` (and all data in air-gap mode). See [ADR-0002](../adr/0002-vector-store-split.md). |
| `parser` | New | Docling + Tesseract OCR: PDF, DOCX, XLSX, images, OSCAL JSON/XML, scanner exports (Nessus, SCAP). |
| `rules` | New | Deterministic control checks against OSCAL catalogs/profiles. See [ADR-0004](../adr/0004-rules-engine-authority.md). |
| `scorer` | New | FastAPI predictive model server loading MLflow-registered models. See [ADR-0005](../adr/0005-predictive-stack.md). |
| `trainer` | New (GPU, on-demand profile) | QLoRA fine-tuning, eval harness, red-team runs. |
| `mlflow` | Existing | Experiments, metrics, model registry for predictive + fine-tuned models. |
| `minio` | New | S3-compatible store for restricted raw files, datasets, adapters. |
| `redis` | Existing (optional) | LiteLLM cache — disabled for restricted classifications. |

## 3. Key data flows

### 3.1 Grounded generation (RAG) — e.g. "Draft the AC-2 narrative"

```mermaid
sequenceDiagram
  participant UI as Dashboard
  participant GW as Gateway Worker
  participant V as Vectorize / Qdrant
  participant L as LiteLLM → model
  UI->>GW: POST /api/knowledge/answer {question, collection, X-Data-Classification}
  GW->>GW: auth, rbac, classify → pick vector store by classification
  GW->>V: embed (on-prem) + top-k search, tenant + ACL filter
  V-->>GW: chunks + source ids
  GW->>L: prompt = system + retrieved chunks + question
  L-->>GW: draft + citations
  GW->>GW: citation check (every claim → a source id)
  GW-->>UI: draft, citations, confidence, audit request_id
```

Restricted (`cui`/`phi`/`classified`) search runs entirely on-prem: the gateway
calls a single tunnel endpoint (`/rag/answer`) and only receives the final
answer + source ids, never raw chunks persisted at the edge.

### 3.2 Data ingestion (Gate G1)

`upload → quarantine → scan + classify → G1 approval → parse → chunk → embed → index → available`

Detail in [`02-data-and-learning.md`](02-data-and-learning.md#2-how-you-give-it-data).

### 3.3 Agent run (Gate G4)

```mermaid
sequenceDiagram
  participant O as Initiator (operator / assessor)
  participant H as Assigned approver (ISSO on System X)
  participant GW as Gateway
  participant WF as Workflow (agent run)
  participant T as Tools (on-prem)
  O->>GW: start "Assess AC family for System X"
  GW->>GW: pre-flight: an eligible approver other than O exists
  GW->>WF: create run (autonomy cap, budget, scope)
  loop each step
    WF->>T: tool call (retrieve, analyze, draft) — L1–L3 auto
    T-->>WF: result
  end
  WF->>GW: approval_request (e.g. publish 9 findings)
  GW-->>H: Approvals Inbox notification (routed by role + system, never to O)
  H->>GW: approve / edit / reject
  GW->>WF: sendEvent(approval)
  WF-->>GW: completed, artifacts, audit trail
```

### 3.4 Learning loop (Gates G2, G3)

`approved dataset → G2 training approval → QLoRA run → eval + red-team → register version (dev) → staged → approved → G3 two-person → production`

## 4. Classification-driven routing

The existing `classification_policies.allowed_destinations` drives **where data
and vectors may live**. We add two destination values, `vectorize` and `workers-ai`, and keep
the rest:

| Classification | Raw files | Vectors | Inference | Edge caching |
|---|---|---|---|---|
| `public` | R2 | Vectorize | **Workers AI** (default) or own GPU | allowed |
| `internal` | R2 | Vectorize | **Workers AI** (default) or own GPU | allowed, short TTL |
| `cui` | MinIO (on-prem) | Qdrant | own GPU on-prem / GovCloud only — never Workers AI | **never** |
| `phi` | MinIO, tokenized | Qdrant | on-prem only, `X-PHI-Tokenized` | **never** |
| `classified` | MinIO (enclave) | Qdrant | on-prem only | **never** |

**Which inference backend is used** ([ADR-0009](../adr/0009-workers-ai-for-non-restricted.md)):
the gateway checks `enforceClassification(env, classification, 'workers-ai')`.
If the policy allows it (seeded for `public` and `internal` only), the call
goes to the `AI` binding; otherwise it goes through the tunnel to LiteLLM on
an own-GPU endpoint whose `allowed_classifications` include the request's
class. If neither is available the request is refused. Requests that name a
Forge fine-tuned model always go to the own-GPU path.

**Where the data plane runs also limits classification.** Each registered
endpoint gets an `allowed_classifications` list (new column on `endpoints`).
The pilot GPU host on Hetzner ([ADR-0008](../adr/0008-pilot-gpu-hosting-hetzner.md))
is registered as `public` / `internal` only; CUI, PHI and classified requests
are routed only to endpoints on customer premises or a US FedRAMP / GovCloud
host, and the gateway refuses the request if no such endpoint exists.

`enforceClassification(env, classification, destination)` in
`worker/src/middleware/classify.ts` is reused unchanged — callers just pass the
new destination (`'vectorize'`, `'workers-ai'`, `'r2'`, `'on-prem'`). `AllowedDestination` in
`worker/src/types.ts` gains `'vectorize'` and `'workers-ai'`.

## 5. Deployment modes

| Aspect | **Hybrid** (default) | **Air-gap** (per-tenant switch) |
|---|---|---|
| Control plane | Cloudflare Workers, Hyperdrive → managed Postgres, R2, KV, Vectorize, Workflows | Same Worker code run locally on `workerd` (see [ADR-0006](../adr/0006-air-gap-runtime.md)) |
| Identity | Cloudflare Access + IdP | Local OIDC (Keycloak) issuing the same JWT claims (`email`, `groups`) |
| Metadata DB | Managed Postgres (US) via Hyperdrive | Postgres on-prem (same migrations, same driver) |
| Objects | R2 + MinIO | MinIO only |
| Vectors | Vectorize + Qdrant | Qdrant only |
| Orchestration | Cloudflare Workflows | Local workflow adapter (same step interface), backed by Postgres |
| Updates | `git` + Workers Builds | Signed offline bundle (containers + models + migrations), verified on import |
| Network | Outbound-only tunnel | None — no route to the internet |

Code rule that makes the switch possible: **handlers depend on small
interfaces** (`ObjectStore`, `VectorStore`, `WorkflowRunner`, `IdentityVerifier`)
with a Cloudflare implementation and a local implementation. No handler calls
`env.DATA_BUCKET` or Vectorize directly.

## 6. Non-functional targets (pilot)

| Metric | Target |
|---|---|
| RAG answer p95 (8B model, top-8 chunks) | < 6 s |
| Evidence-review throughput | ≥ 500 artifacts/hour on one 48 GB GPU |
| Ingestion | ≥ 1,000 pages/hour |
| Availability (control plane) | 99.9% (Cloudflare SLA) |
| Availability (data plane) | 99.5% single host; HA is a later phase |
| Audit completeness | 100% of privileged actions + all gate decisions |
