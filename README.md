# ForgeClosedML — Closed ML Environment Control Plane

> **Forge Cyber Defense** | Security Forged. Trust Proven.
> 
> Deploy AI/ML inside federal and healthcare security boundaries.
> FedRAMP · CMMC · FISMA · HIPAA compliant by design.

**Status:** Beta — Internal Use

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  CLOUDFLARE (Cloud Orchestration — Layer 3)                     │
│                                                                 │
│  ┌──────────────┐  ┌──────────┐  ┌─────┐  ┌──────────────────┐ │
│  │ Worker API   │  │ D1       │  │ R2  │  │ Pages            │ │
│  │ Gateway      │  │ Metadata │  │ Artifacts │  │ Dashboard   │ │
│  │ (Auth/Route) │  │ & Audit  │  │     │  │                  │ │
│  └──────┬───────┘  └──────────┘  └─────┘  └──────────────────┘ │
│         │                                                       │
│         │  Cloudflare Tunnel (encrypted, outbound-only)         │
└─────────┼───────────────────────────────────────────────────────┘
          │
┌─────────┼───────────────────────────────────────────────────────┐
│  ON-PREM│(Secure Core — Layers 1, 2, 4, 5)                     │
│         │                                                       │
│  ┌──────▼───────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐ │
│  │ LiteLLM      │  │ Ollama   │  │ MLflow   │  │ Wazuh SIEM │ │
│  │ Proxy        │  │ Inference│  │ Tracking │  │            │ │
│  │ :4000        │  │ :11434   │  │ :5000    │  │            │ │
│  └──────────────┘  └──────────┘  └──────────┘  └────────────┘ │
│                                                                 │
│  Isolated Inference VLAN — No Default Gateway                   │
│  GPU: NVIDIA A100/H100 | Storage: NVMe + ZFS (encrypted)       │
└─────────────────────────────────────────────────────────────────┘
```

### Core Design Principle

> **Data never leaves the boundary it was classified in.**
> Models are artifacts — treat them like code under version control with a chain of custody.

---

## Repository Structure

```
forge-closedml/
├── worker/                         # Cloudflare Worker API Gateway
│   ├── src/
│   │   ├── index.ts               # Main router — all API endpoints
│   │   ├── types.ts               # TypeScript type definitions
│   │   ├── middleware/
│   │   │   ├── auth.ts            # CF Access JWT + service token + API key validation
│   │   │   ├── audit.ts           # D1 audit event logging (NIST AU-2/AU-3)
│   │   │   └── classify.ts       # Data classification policy enforcement
│   │   └── handlers/
│   │       ├── inference.ts       # Proxy to LiteLLM — classification enforcement + logging
│   │       ├── models.ts          # Model registry CRUD + two-person promotion
│   │       └── dashboard.ts       # Aggregated metrics and statistics
│   ├── migrations/
│   │   └── 0001_initial.sql       # D1 schema: models, inference_logs, audit, endpoints
│   ├── wrangler.toml              # Cloudflare deployment config
│   └── package.json
│
├── dashboard/                      # React Management Dashboard
│   ├── src/
│   │   ├── App.tsx                # All pages: Dashboard, Models, Inference, Audit, Endpoints
│   │   ├── lib/api.ts             # API client for Worker endpoints
│   │   └── index.css              # Tailwind v4 + Forge brand tokens
│   ├── vite.config.ts
│   └── package.json
│
├── config/                         # On-Prem Configuration Templates
│   ├── cloudflared-tunnel.yml     # Cloudflare Tunnel ingress rules
│   ├── litellm-config.yaml        # LiteLLM proxy — model routing
│   └── Modelfile.forge-compliance # Ollama Modelfile for fine-tuned compliance model
│
├── docker-compose.yml             # On-prem inference stack (Ollama, LiteLLM, MLflow, Tunnel, Wazuh)
└── README.md
```

---

## Deployment Guide

### Prerequisites

- **Cloudflare account** with Workers, D1, R2, KV, Pages, and Access enabled
- **Wrangler CLI**: `npm install -g wrangler`
- **Node.js 20+** for local development
- **On-prem server** with NVIDIA GPU + Docker (for Phase 2)

---

### Phase 1: Cloud Layer (Worker + Dashboard)

#### Step 1 — Create GitHub Repo

1. Go to `github.com/Bjay0727-jay` → **New Repository**
2. Name: `forge-closedml`
3. Visibility: **Private**
4. Add README, create repo
5. Upload all project files (or `git push` from local)

#### Step 2 — Create Cloudflare Resources

```bash
# Authenticate
wrangler login

# Create D1 database
cd worker
wrangler d1 create forge-closedml-db
# Copy the database_id into wrangler.toml

# Run migrations
wrangler d1 execute forge-closedml-db --file=./migrations/0001_initial.sql

# Create KV namespace
wrangler kv namespace create INFERENCE_CACHE
# Copy the id into wrangler.toml

# Create R2 bucket
wrangler r2 bucket create forge-closedml-models

# Set secrets
wrangler secret put API_SECRET
# Generate: openssl rand -hex 32

wrangler secret put LITELLM_ENDPOINT
# Value: http://inference.forgecyberdefense.com (set after Tunnel)

wrangler secret put MLFLOW_ENDPOINT
# Value: http://mlflow.forgecyberdefense.com (set after Tunnel)
```

#### Step 3 — Deploy Worker

```bash
cd worker
npm install
wrangler deploy
```

The Worker deploys to `forge-closedml.<your-subdomain>.workers.dev`.

**Add custom domain** in Cloudflare dashboard:
- Workers & Pages → forge-closedml → Settings → Domains
- Add: `closedml-api.forgecyberdefense.com`

#### Step 4 — Deploy Dashboard to Cloudflare Pages

```bash
cd dashboard
npm install
npm run build
```

**Via Cloudflare Dashboard:**
1. Workers & Pages → Create → Pages → Connect to Git
2. Select the `forge-closedml` repo
3. Build settings:
   - **Root directory:** `dashboard`
   - **Build command:** `npm run build`
   - **Build output:** `dist`
4. **Environment variable:** `VITE_API_BASE` = `https://closedml-api.forgecyberdefense.com`
5. Save and Deploy

**Add custom domain:** `closedml.forgecyberdefense.com`

#### Step 5 — Secure with Cloudflare Access

1. Zero Trust → Access → Applications → Add
2. **Application domain:** `closedml.forgecyberdefense.com`
3. Policy: Allow — Email list (your team emails)
4. Require MFA: Yes
5. Session duration: 8 hours

Repeat for `closedml-api.forgecyberdefense.com` (API gateway).

---

### Phase 2: On-Prem Inference Stack

#### Step 6 — Prepare On-Prem Server

Requirements:
- Ubuntu 22.04 LTS (STIG/CIS L2 hardened)
- NVIDIA GPU (A100/H100 or RTX 4090)
- NVIDIA Container Toolkit
- Docker 24+ with Compose v2

```bash
# Install Docker + NVIDIA runtime
curl -fsSL https://get.docker.com | sh
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

#### Step 7 — Configure Cloudflare Tunnel

```bash
# Install cloudflared
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Authenticate
cloudflared tunnel login

# Create tunnel
cloudflared tunnel create forge-closedml
# Note the Tunnel ID — update config/cloudflared-tunnel.yml

# Copy credentials
sudo mkdir -p /etc/cloudflare
sudo cp ~/.cloudflared/<TUNNEL_ID>.json /etc/cloudflare/

# Update config and start
sudo cp config/cloudflared-tunnel.yml /etc/cloudflare/config.yml
# Edit: replace <TUNNEL_ID> with your actual tunnel ID

# Create DNS routes
cloudflared tunnel route dns forge-closedml inference.forgecyberdefense.com
cloudflared tunnel route dns forge-closedml mlflow.forgecyberdefense.com
cloudflared tunnel route dns forge-closedml airflow.forgecyberdefense.com
```

#### Step 8 — Launch Inference Stack

```bash
# From project root
docker compose up -d

# Verify
docker compose ps
docker compose logs -f litellm

# Pull base model
docker exec forge-ollama ollama pull llama3.1:8b-instruct-q4_K_M

# Test inference
curl http://localhost:4000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3.1-8b",
    "messages": [{"role": "user", "content": "What is NIST 800-53 AC-2?"}],
    "max_tokens": 200
  }'
```

#### Step 9 — Register Endpoint in Control Plane

```bash
# Register the inference endpoint via the Worker API
curl -X POST https://closedml-api.forgecyberdefense.com/api/endpoints \
  -H "Authorization: Bearer <YOUR_API_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "inference-node-01",
    "service_type": "litellm",
    "internal_url": "http://localhost:4000",
    "external_host": "inference.forgecyberdefense.com",
    "status": "online"
  }'
```

---

### Phase 3: Platform Integration

Wire ForgeComply 360, ForgeScan 360, and ForgeAI Govern to use the closed ML endpoint:

```typescript
// In any Forge platform — replace external AI calls
const response = await fetch('https://closedml-api.forgecyberdefense.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer <service-token>',
    'X-Data-Classification': 'cui',       // REQUIRED — enforced by Worker
  },
  body: JSON.stringify({
    model: 'forge-compliance',
    messages: [{ role: 'user', content: 'Assess AC-2 implementation for...' }],
    source_platform: 'forgecomply',        // Logged in audit trail
    data_classification: 'cui',
  }),
});
```

---

### Phase 4: Evidence & ConMon

The control plane automatically generates evidence:

- **Inference logs** → Every request logged with classification, user, model, tokens
- **Audit events** → Model promotions, config changes, access decisions
- **ConMon period tagging** → All events tagged with quarter (e.g., `2026-Q2`)
- **Classification violations** → Any boundary crossing attempt is logged as CRITICAL

Export evidence via the API:
```bash
# Export all audit events for current ConMon period
curl "https://closedml-api.forgecyberdefense.com/api/audit?conmon_period=2026-Q2&limit=200" \
  -H "Authorization: Bearer <token>"
```

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/chat/completions` | Inference proxy (LiteLLM-compatible) |
| `GET` | `/api/dashboard/stats` | Aggregated metrics |
| `GET` | `/api/dashboard/timeline?days=7` | Inference timeline |
| `GET` | `/api/dashboard/usage` | Model usage stats |
| `GET` | `/api/models?status=production` | List models |
| `POST` | `/api/models` | Register model |
| `POST` | `/api/models/:id/promote` | Promote model lifecycle |
| `GET` | `/api/audit?severity=critical` | Query audit events |
| `GET` | `/api/endpoints` | List endpoints |
| `POST` | `/api/endpoints/:id/health` | Update endpoint health |
| `GET` | `/api/inference-logs` | Query inference logs |
| `GET` | `/health` | Worker health check |

---

## Security Controls Mapping

| NIST 800-53 | Implementation |
|-------------|---------------|
| AC-2 Account Management | Cloudflare Access + MFA enforcement |
| AC-3 Access Enforcement | Data classification policy engine |
| AU-2 Audit Events | All inference, model, and config events logged |
| AU-3 Content of Audit Records | Full context: actor, resource, classification, timestamp |
| AU-6 Audit Review | Dashboard + ConMon period filtering |
| AU-12 Audit Generation | Automatic — every Worker request generates audit |
| SC-8 Transmission Confidentiality | TLS 1.3 via Cloudflare Tunnel |
| SC-28 Protection of Information at Rest | AES-256 ZFS encryption on inference nodes |
| SI-7 Software Integrity | SHA-256 model artifact signing |

---

## License

Proprietary — Forge Cyber Defense. All rights reserved.

*Security Forged. Trust Proven.*
