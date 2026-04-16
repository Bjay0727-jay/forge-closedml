# ForgeClosedML

Production-ready MVP for Forge Cyber Defense: Cloudflare-hosted control plane + on-prem inference behind outbound-only Cloudflare Tunnel.

## Repository Layout

```txt
forge-closedml/
  worker/
  dashboard/
  config/
  docker-compose.yml
  README.md
```

## What is Implemented

### Worker API Gateway (TypeScript)
- `POST /v1/chat/completions`
- `GET /api/dashboard/stats`
- `GET /api/dashboard/timeline`
- `GET /api/dashboard/usage`
- `GET /api/models`
- `POST /api/models`
- `POST /api/models/:id/promote`
- `GET /api/audit`
- `GET /api/endpoints`
- `POST /api/endpoints`
- `POST /api/endpoints/:id/health`
- `GET /api/inference-logs`
- `GET /health`

Middleware:
- `worker/src/middleware/auth.ts`
- `worker/src/middleware/audit.ts`
- `worker/src/middleware/classify.ts`

Security controls:
- actor/service identity required
- explicit `X-Data-Classification` enforcement
- structured audit logging
- request size limit (1MB)
- KV-backed per-identity rate limiting
- explicit JSON validation on write endpoints
- no hard-coded secrets
- artifact signature / provenance placeholders

### D1 Schema
Defined in `worker/migrations/0001_initial.sql`:
- `models`
- `model_versions`
- `endpoints`
- `inference_logs`
- `audit_events`
- `promotion_approvals`

### Dashboard (React + TypeScript + Vite)
Pages:
- Dashboard
- Models
- Endpoints
- Inference Logs
- Audit Events
- Policy Violations

### On-Prem Compose Stack
- Ollama
- LiteLLM
- MLflow
- cloudflared
- optional Redis profile
- tunnel + LiteLLM config templates in `config/`

## Governance
- lifecycle states: `dev`, `staged`, `approved`, `production`, `quarantined`
- two-person promotion to production (via `promotion_approvals`)
- audit logging for privileged actions
- ConMon evidence grouping via `audit_events.conmon_period`
- classification violations logged as critical

## Local Development

```bash
# worker
cd worker
npm install
cp .dev.vars.example .dev.vars
npm run dev

# dashboard
cd ../dashboard
npm install
npm run dev
```

## Deployment

1. Configure `worker/wrangler.toml` bindings and IDs.
2. Apply D1 migration:
   - `wrangler d1 execute forge-closedml-db --file=./migrations/0001_initial.sql`
3. Set Worker secrets:
   - `wrangler secret put API_SECRET`
   - `wrangler secret put LITELLM_ENDPOINT`
   - `wrangler secret put MLFLOW_ENDPOINT`
4. Deploy worker: `wrangler deploy`
5. Build/deploy dashboard to Cloudflare Pages.
6. Start on-prem stack: `docker compose up -d`

## TODO (Hardening)
- Verify CF Access JWT signatures against JWKS.
- Add WAF rules + mTLS for service identities.
- Add OpenAPI contract + schema validation library.
- Add row-level tenant enforcement.
- Add signed evidence bundle export endpoint.
- Add CI tests and SAST/DAST pipelines.
