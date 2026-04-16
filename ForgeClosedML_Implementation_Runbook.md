# ForgeClosedML Implementation Runbook

## Purpose

This runbook packages the full working guidance for building and deploying **ForgeClosedML** for **Forge Cyber Defense**.

It includes:

- architecture review and recommendations
- phased roadmap
- Codex build prompts
- Cloudflare Web UI deployment instructions
- Wrangler configuration
- D1 schema
- Docker Compose example
- Cloudflare Tunnel example
- environment variable templates
- GitHub Actions workflows
- smoke tests
- operational recommendations

Grounding note: this runbook is based on the uploaded ForgeClosedML design, including the Cloudflare Worker/D1/R2/Pages control plane, the on-prem LiteLLM/Ollama/MLflow stack, Cloudflare Tunnel, and the security principle that data never leaves the classified boundary it originated in.

---

## 1. Executive review

### Overall assessment

The design is strong as a **secure inference control plane MVP** and a good fit for Forge’s federal and healthcare positioning.

The strongest aspects are:

- boundary-first architecture
- cloud control plane + on-prem inference split
- explicit classification enforcement intent
- audit and evidence generation
- access control via Cloudflare Access
- outbound-only tunnel pattern
- support for integration into Forge platforms

### What it is today

Right now, the design is best positioned as:

- **Closed ML Gateway**
- **Model Governance Control Plane**
- **Private Inference Platform**

### What it is not yet

It is not yet a full closed ML factory. Missing pieces include:

- dataset lifecycle and lineage
- full training pipeline orchestration
- evaluation harnesses
- model provenance and attestation
- richer supply-chain security
- tenant-isolated retrieval pipelines
- sovereign all-on-prem control plane mode

---

## 2. Architecture scorecard

### Green

- strong boundary-first concept
- Worker + Pages + D1 + R2 is a fast MVP stack
- audit and ConMon evidence fit Forge’s compliance story
- classification-aware routing is a useful differentiator
- on-prem inference is the right trust boundary for regulated use cases

### Yellow

- registry and promotion logic need more rigor
- multi-tenant isolation is not fully defined
- resilience needs better failover and queueing
- supply-chain verification needs more than hash-only integrity
- RAG and vector governance are not yet defined

### Red

- do not market this yet as a full closed ML platform
- do not rely only on SHA-256 hashes as the model integrity story
- do not assume all buyers will accept a SaaS-hosted control plane

---

## 3. Recommended product framing

Forge should define this offering in three stages.

### Layer A: Forge ClosedML Gateway

Secure inference gateway and policy enforcement.

Includes:

- auth
- classification enforcement
- request logging
- audit logging
- endpoint routing
- evidence export

### Layer B: Forge ClosedML Registry

Governed model lifecycle.

Includes:

- model catalog
- model versions
- promotion workflow
- two-person approval
- rollback
- approval evidence

### Layer C: Forge ClosedML Factory

Full lifecycle ML platform.

Includes:

- dataset registry
- training jobs
- evaluation pipelines
- safety and red-team tests
- provenance
- drift monitoring

---

## 4. Phased roadmap

### Phase 1 — Gateway MVP

Build first:

- Cloudflare Worker API
- D1 audit and metadata
- R2 artifact metadata or model pointers
- Pages dashboard
- Cloudflare Access
- LiteLLM + Ollama + MLflow on-prem stack
- endpoint registration and health
- inference logs
- evidence export

Success criteria:

- ForgeComply 360 can send a classified inference request
- policy blocks disallowed classification patterns
- audit captures actor, model, classification, source platform, and timestamp
- dashboard shows endpoint status and recent usage

### Phase 2 — Governed registry

Build next:

- model lifecycle states
- versioning
- signed artifact metadata
- approval workflow
- promotion gates
- rollback
- quarantine state

Success criteria:

- no production promotion without evidence
- promotion requires two-person approval
- rollback is simple and auditable

### Phase 3 — Tenant-safe retrieval and platform integration

Build after registry:

- embeddings support
- reranker support
- vector index isolation
- retrieval allowlists
- prompt template versioning
- output logging and retention controls
- shared SDK for Forge products

Success criteria:

- tenant data cannot cross retrieval boundaries
- retrieval source usage is auditable
- Forge platforms all call one consistent gateway contract

### Phase 4 — Closed ML Factory

Build later:

- dataset registry
- fine-tuning jobs
- evaluation harness
- artifact provenance
- red-team suite
- periodic drift and regression checks

---

## 5. Codex build prompts

### Prompt 1 — build the MVP

```text
Build ForgeClosedML as a production-ready MVP for Forge Cyber Defense.

Product goal:
A closed-boundary ML control plane where Cloudflare hosts the secure control plane and dashboard, while model inference stays on-prem behind an outbound-only Cloudflare Tunnel.

Required repository layout:
forge-closedml/
  worker/
  dashboard/
  config/
  docker-compose.yml
  README.md

Implement:

1. Cloudflare Worker API Gateway in TypeScript
- Endpoints:
  - POST /v1/chat/completions
  - GET /api/dashboard/stats
  - GET /api/dashboard/timeline
  - GET /api/dashboard/usage
  - GET /api/models
  - POST /api/models
  - POST /api/models/:id/promote
  - GET /api/audit
  - GET /api/endpoints
  - POST /api/endpoints
  - POST /api/endpoints/:id/health
  - GET /api/inference-logs
  - GET /health
- Middleware:
  - auth.ts
  - audit.ts
  - classify.ts
- D1 schema:
  - models
  - model_versions
  - endpoints
  - inference_logs
  - audit_events
  - promotion_approvals

2. Dashboard in React + TypeScript + Vite
- Pages:
  - Dashboard
  - Models
  - Endpoints
  - Inference Logs
  - Audit Events
  - Policy Violations

3. On-prem stack via Docker Compose
- Ollama
- LiteLLM
- MLflow
- cloudflared
- optional Redis
- config templates for tunnel and LiteLLM

4. Governance requirements
- model lifecycle states: dev, staged, approved, production, quarantined
- two-person promotion approval
- audit on every privileged action
- evidence export grouped by ConMon period
- classification violation logging as critical

5. Security requirements
- require actor identity or service identity
- enforce X-Data-Classification header
- structured audit logging
- request size limits
- rate limiting
- explicit JSON validation
- no hard-coded secrets
- add placeholder fields for artifact signatures and provenance

6. Delivery requirements
- full working code
- wrangler.toml
- migration SQL
- .env.example and .dev.vars.example
- README with local dev and deployment steps
- clear TODOs for future hardening

After code generation, also output:
- architecture summary
- assumptions
- deployment checklist
- smoke test checklist
```

### Prompt 2 — hardening pass

```text
Perform a production hardening pass on ForgeClosedML.

Tasks:
- review auth flow for bypass risk
- tighten classification enforcement
- add request ID propagation
- add structured audit events everywhere
- add validation to every endpoint
- improve D1 indexes
- improve dashboard API error handling
- add health vs readiness distinction
- add rollback support for model promotion
- document remaining production gaps honestly

Output:
- changed files
- why each change matters
- remaining risks
```

### Prompt 3 — deployment docs

```text
Write a deployment guide for ForgeClosedML for two audiences:

1. Cloudflare Web UI deployer
2. CLI / DevOps deployer

Include:
- prerequisites
- exact order of operations
- Cloudflare D1, R2, KV, Worker, Pages, Access setup
- required environment variables and secrets
- on-prem Docker Compose setup
- cloudflared tunnel setup
- endpoint registration
- smoke tests
- common failure modes and fixes

Make it concise, accurate, and production-minded.
```

### Prompt 4 — CI/CD

```text
Add CI/CD for ForgeClosedML.

Requirements:
- GitHub Actions workflow for Worker deployment using Wrangler
- GitHub Actions workflow for dashboard build validation
- do not store secrets in repo
- document required GitHub secrets and Cloudflare tokens
- support branch-based preview for dashboard if practical
- fail builds on TypeScript errors
- include a short deployment runbook in README
```

---

## 6. Recommended repo structure

```text
forge-closedml/
├── worker/
│   ├── src/
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts
│   │   │   ├── audit.ts
│   │   │   └── classify.ts
│   │   └── handlers/
│   │       ├── inference.ts
│   │       ├── models.ts
│   │       ├── endpoints.ts
│   │       ├── dashboard.ts
│   │       └── audit.ts
│   ├── migrations/
│   │   └── 0001_initial.sql
│   ├── wrangler.toml
│   ├── package.json
│   └── .dev.vars.example
├── dashboard/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── lib/api.ts
│   │   └── index.css
│   ├── package.json
│   └── .env.example
├── config/
│   ├── cloudflared-tunnel.yml
│   ├── litellm-config.yaml
│   └── Modelfile.forge-compliance
├── docker-compose.yml
└── README.md
```

---

## 7. Cloudflare deployment strategy

### Best practical strategy

Use this split:

- **Codex** for code generation, edits, workflows, and docs
- **GitHub** as the source of truth
- **Cloudflare Web UI** for first-time resource creation and Pages deployment
- **Wrangler CLI or GitHub Actions** for repeatable Worker deploys

This is the fastest and least fragile path.

---

## 8. Cloudflare Web UI deployment steps

## Step 1 — Create the GitHub repo

Create a private repository:

- `forge-closedml`

Push the generated code.

## Step 2 — Create Cloudflare resources

Create these in Cloudflare:

- D1 database: `forge-closedml-db`
- R2 bucket: `forge-closedml-models`
- KV namespace if needed: `INFERENCE_CACHE`

## Step 3 — Configure Worker bindings

Update `worker/wrangler.toml` with the actual IDs.

## Step 4 — Deploy the Worker

Fastest first deploy:

```bash
cd worker
npm install
wrangler login
wrangler deploy
```

Then attach a custom domain:

- `closedml-api.forgecyberdefense.com`

## Step 5 — Deploy the dashboard with Pages

In Cloudflare Pages:

- connect to GitHub
- choose repo `forge-closedml`
- root directory: `dashboard`
- build command: `npm run build`
- build output directory: `dist`

Set environment variable:

- `VITE_API_BASE=https://closedml-api.forgecyberdefense.com`

Attach custom domain:

- `closedml.forgecyberdefense.com`

## Step 6 — Protect with Cloudflare Access

Create Zero Trust applications for:

- `closedml.forgecyberdefense.com`
- `closedml-api.forgecyberdefense.com`

Require:

- Forge email allowlist
- MFA
- session limits
- optionally device posture later

---

## 9. Wrangler configuration

Create `worker/wrangler.toml`:

```toml
name = "forge-closedml"
main = "src/index.ts"
compatibility_date = "2026-04-15"

[vars]
ENVIRONMENT = "production"

[[d1_databases]]
binding = "DB"
database_name = "forge-closedml-db"
database_id = "REPLACE_ME"

[[r2_buckets]]
binding = "MODEL_BUCKET"
bucket_name = "forge-closedml-models"

[[kv_namespaces]]
binding = "INFERENCE_CACHE"
id = "REPLACE_ME"
```

---

## 10. D1 schema

Create `worker/migrations/0001_initial.sql`:

```sql
CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  owner TEXT,
  status TEXT NOT NULL DEFAULT 'dev',
  classification_level TEXT NOT NULL DEFAULT 'internal',
  artifact_uri TEXT,
  artifact_hash TEXT,
  artifact_signature TEXT,
  provenance_uri TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS model_versions (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  version TEXT NOT NULL,
  base_model TEXT,
  changelog TEXT,
  eval_summary TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (model_id) REFERENCES models(id)
);

CREATE TABLE IF NOT EXISTS endpoints (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  service_type TEXT NOT NULL,
  internal_url TEXT NOT NULL,
  external_host TEXT,
  environment TEXT DEFAULT 'prod',
  status TEXT NOT NULL DEFAULT 'offline',
  last_health_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inference_logs (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  source_platform TEXT,
  model TEXT NOT NULL,
  endpoint_id TEXT,
  classification_level TEXT NOT NULL,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  decision TEXT NOT NULL,
  latency_ms INTEGER DEFAULT 0,
  conmon_period TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (endpoint_id) REFERENCES endpoints(id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  request_id TEXT,
  actor TEXT NOT NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  classification_level TEXT,
  details_json TEXT,
  conmon_period TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS promotion_approvals (
  id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  model_version_id TEXT NOT NULL,
  requested_state TEXT NOT NULL,
  approver TEXT NOT NULL,
  decision TEXT NOT NULL,
  rationale TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (model_id) REFERENCES models(id),
  FOREIGN KEY (model_version_id) REFERENCES model_versions(id)
);

CREATE INDEX IF NOT EXISTS idx_models_status ON models(status);
CREATE INDEX IF NOT EXISTS idx_model_versions_model_id ON model_versions(model_id);
CREATE INDEX IF NOT EXISTS idx_endpoints_status ON endpoints(status);
CREATE INDEX IF NOT EXISTS idx_inference_logs_created_at ON inference_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_inference_logs_model ON inference_logs(model);
CREATE INDEX IF NOT EXISTS idx_inference_logs_classification ON inference_logs(classification_level);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_events_event_type ON audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_severity ON audit_events(severity);
```

Apply it:

```bash
cd worker
wrangler d1 execute forge-closedml-db --file=./migrations/0001_initial.sql
```

---

## 11. Environment variable templates

### `worker/.dev.vars.example`

```env
API_SECRET=replace_me
LITELLM_ENDPOINT=http://localhost:4000
MLFLOW_ENDPOINT=http://localhost:5000
ACCESS_AUDIENCE=replace_me
ENVIRONMENT=development
```

### `dashboard/.env.example`

```env
VITE_API_BASE=https://closedml-api.forgecyberdefense.com
```

---

## 12. Docker Compose example

Create `docker-compose.yml`:

```yaml
version: "3.9"

services:
  ollama:
    image: ollama/ollama:latest
    container_name: forge-ollama
    restart: unless-stopped
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: ["gpu"]

  litellm:
    image: ghcr.io/berriai/litellm:main-latest
    container_name: forge-litellm
    restart: unless-stopped
    depends_on:
      - ollama
    ports:
      - "4000:4000"
    volumes:
      - ./config/litellm-config.yaml:/app/config.yaml:ro
    command: ["--config", "/app/config.yaml", "--port", "4000"]

  mlflow:
    image: ghcr.io/mlflow/mlflow:v2.14.3
    container_name: forge-mlflow
    restart: unless-stopped
    ports:
      - "5000:5000"
    command: mlflow server --host 0.0.0.0 --port 5000

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: forge-cloudflared
    restart: unless-stopped
    depends_on:
      - litellm
      - mlflow
    command: tunnel run
    volumes:
      - ./config/cloudflared-tunnel.yml:/etc/cloudflared/config.yml:ro
      - /etc/cloudflare:/etc/cloudflare:ro

volumes:
  ollama_data:
```

---

## 13. LiteLLM config

Create `config/litellm-config.yaml`:

```yaml
model_list:
  - model_name: forge-compliance
    litellm_params:
      model: ollama/llama3.1:8b-instruct-q4_K_M
      api_base: http://ollama:11434

general_settings:
  master_key: replace_me
```

---

## 14. Cloudflare Tunnel config

Create `config/cloudflared-tunnel.yml`:

```yaml
tunnel: REPLACE_TUNNEL_ID
credentials-file: /etc/cloudflare/REPLACE_TUNNEL_ID.json

ingress:
  - hostname: inference.forgecyberdefense.com
    service: http://litellm:4000
  - hostname: mlflow.forgecyberdefense.com
    service: http://mlflow:5000
  - service: http_status:404
```

---

## 15. Ollama Modelfile example

Create `config/Modelfile.forge-compliance`:

```text
FROM llama3.1:8b-instruct-q4_K_M

SYSTEM <<'MODELEOF'
You are Forge Compliance Assistant.
You help with federal cybersecurity, healthcare compliance, audit preparation,
control interpretation, and evidence-oriented explanations.
Be accurate, conservative, and concise.
MODELEOF
```

---

## 16. On-prem deployment steps

## Server prerequisites

Recommended:

- Ubuntu 22.04 LTS
- Docker 24+
- Compose v2
- NVIDIA GPU
- NVIDIA Container Toolkit
- encrypted storage
- hardened OS baseline

## Docker and GPU runtime

```bash
curl -fsSL https://get.docker.com | sh
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

## Start the stack

```bash
docker compose up -d
docker compose ps
docker compose logs -f litellm
```

## Pull the base model

```bash
docker exec forge-ollama ollama pull llama3.1:8b-instruct-q4_K_M
```

---

## 17. Register the endpoint

Once the Worker and tunnel are ready:

```bash
curl -X POST https://closedml-api.forgecyberdefense.com/api/endpoints   -H "Authorization: Bearer YOUR_API_SECRET"   -H "Content-Type: application/json"   -d '{
    "name": "inference-node-01",
    "service_type": "litellm",
    "internal_url": "http://localhost:4000",
    "external_host": "inference.forgecyberdefense.com",
    "status": "online"
  }'
```

---

## 18. Smoke tests

### Worker health

```bash
curl https://closedml-api.forgecyberdefense.com/health
```

### Inference test

```bash
curl https://closedml-api.forgecyberdefense.com/v1/chat/completions   -H "Content-Type: application/json"   -H "Authorization: Bearer YOUR_SERVICE_TOKEN"   -H "X-Data-Classification: cui"   -d '{
    "model": "forge-compliance",
    "messages": [{"role":"user","content":"What is NIST 800-53 AC-2?"}],
    "source_platform": "forgecomply",
    "data_classification": "cui"
  }'
```

### Audit query

```bash
curl "https://closedml-api.forgecyberdefense.com/api/audit?limit=20"   -H "Authorization: Bearer YOUR_API_SECRET"
```

### Dashboard checks

Verify:

- dashboard loads
- endpoint shows online
- inference event appears
- audit event appears
- blocked policy events appear when expected

---

## 19. GitHub Actions

### Worker deployment workflow

Create `.github/workflows/worker-deploy.yml`:

```yaml
name: Deploy Worker

on:
  push:
    branches: [main]
    paths:
      - 'worker/**'
      - '.github/workflows/worker-deploy.yml'

jobs:
  deploy:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: worker

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci
      - run: npm run build --if-present

      - name: Deploy to Cloudflare Workers
        run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

### Dashboard build workflow

Create `.github/workflows/dashboard-build.yml`:

```yaml
name: Dashboard Build

on:
  pull_request:
    paths:
      - 'dashboard/**'
      - '.github/workflows/dashboard-build.yml'
  push:
    branches: [main]
    paths:
      - 'dashboard/**'

jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: dashboard

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci
      - run: npm run build
```

### Required GitHub secrets

Add:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

---

## 20. Recommended service contract for Forge products

All Forge applications should send these fields on inference requests:

Headers:

- `Authorization: Bearer <service-token>`
- `Content-Type: application/json`
- `X-Data-Classification: <classification>`

Body fields:

- `model`
- `messages`
- `source_platform`
- `data_classification`
- optionally `tenant_id`
- optionally `request_context`
- optionally `trace_id`

This creates a consistent contract across:

- ForgeComply 360
- ForgeScan 360
- ForgeAI Govern

---

## 21. Security recommendations

### Must-have controls now

- require service or user identity on every privileged endpoint
- block requests missing classification headers
- audit both allow and deny decisions
- use Access + MFA for dashboard and admin APIs
- separate audit logs from performance telemetry later
- add request IDs everywhere
- rate-limit inference and admin calls
- cap request body size
- do not expose Ollama directly to the internet
- keep inference nodes outbound-only where possible

### Hardening to add next

- signed model manifests
- provenance attestations
- model allowlist policy
- malware / unsafe artifact scanning
- rollback and quarantine workflow
- pool-based endpoint management
- readiness checks separate from health checks
- immutable evidence export bundles

---

## 22. Recommended first implementation order

Do this in order:

1. Generate the repo with Codex
2. Review generated code
3. Push to private GitHub
4. Create D1, R2, and KV in Cloudflare
5. Deploy Worker with Wrangler
6. Deploy dashboard with Pages
7. Protect both with Access
8. Stand up the on-prem stack
9. Create the tunnel
10. Register the inference endpoint
11. Run smoke tests
12. Connect ForgeComply 360

---

## 23. What not to skip

Do not skip:

- classification enforcement
- audit logging on every privileged action
- MFA for the dashboard
- service-to-service authentication
- endpoint health registration
- model rollback design
- honest documentation of current limitations

---

## 24. Bottom line

This design is a strong starting point for **Forge ClosedML** as a secure inference and governance platform.

Best current product framing:

- secure private inference gateway
- policy and classification enforcement layer
- model governance control plane

Best build path:

- use Codex to generate and maintain the codebase
- use GitHub as the source of truth
- use Cloudflare Web UI for first-time setup and Pages deployment
- use Wrangler or GitHub Actions for repeatable Worker deployment

Best next expansion:

- governed registry
- tenant-safe retrieval
- supply-chain hardening
- full training/evaluation factory
