# ForgeClosedML

ForgeClosedML is a closed-boundary ML control plane: Cloudflare hosts API + dashboard, while inference remains on-prem behind outbound-only Cloudflare Tunnel.

## Repository Layout

```txt
forge-closedml/
  worker/
  dashboard/
  config/
  docker-compose.yml
  README.md
```

## MVP Endpoints

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
- `GET /ready`

## Security + Governance Controls

- Actor/service identity required for all API routes except health/readiness.
- `X-Data-Classification` required and must match payload classification if supplied.
- Classification policy enforcement + critical audit event on violation.
- Request size limit (1MB) and KV-backed per-identity rate limiting.
- Structured audit events for privileged and blocked actions.
- Role-based permissions for models/endpoints/audit/inference operations (`viewer`, `operator`, `approver`, `admin`, `service`).
- Model lifecycle states: `dev`, `staged`, `approved`, `production`, `quarantined`.
- Two-person approval gate for promotion to production.
- Rollback support for model promotion using prior promotion evidence.
- Request ID propagation using `X-Request-ID`.

## D1 Schema

Defined in `worker/migrations/0001_initial.sql`:
- `models`
- `model_versions`
- `endpoints`
- `inference_logs`
- `audit_events`
- `promotion_approvals`
- `classification_policies`
- `system_config`

Includes ConMon period grouping (`audit_events.conmon_period`) and placeholder provenance fields (`artifact_signature`, `provenance_uri`).

## Local Development

```bash
# Worker
cd worker
npm install
cp .dev.vars.example .dev.vars
npm run dev

# Dashboard
cd ../dashboard
npm install
npm run dev

# Worker tests
npm run test
```

## Deployment

1. Configure D1/KV/R2 IDs in `worker/wrangler.toml`.
2. Run migration:
   ```bash
   cd worker
   wrangler d1 execute forge-closedml-db --file=./migrations/0001_initial.sql
   ```
3. Configure secrets:
   ```bash
   wrangler secret put API_SECRET
   wrangler secret put LITELLM_ENDPOINT
   wrangler secret put MLFLOW_ENDPOINT
   wrangler secret put CF_ACCESS_CLIENT_ID
   wrangler secret put CF_ACCESS_CLIENT_SECRET
   ```
4. Set vars for Access audience/team domain (`ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`) in wrangler config.
5. Deploy worker + dashboard.
6. Bring up on-prem stack:
   ```bash
   docker compose up -d
   ```

## Honest Production Gaps (Still Outstanding)

1. **No comprehensive integration/e2e suite yet** (a starter auth test suite exists, but route-level coverage is still incomplete).
2. **No policy-as-code engine** (e.g. OPA) for advanced approval and routing controls.
3. **No cryptographic evidence bundle export endpoint** yet (ConMon export is query-based today).
4. **No full multi-tenant isolation** (tenant is fixed to `forge`).
5. **No background dead-letter/retry strategy** for downstream inference failures.
6. **No end-to-end secret rotation automation**.

## Hardening TODOs

- Expand JOSE/JWKS test coverage for key rotation/failure modes.
- Add endpoint-level RBAC.
- Add audit evidence export API by ConMon period (signed artifact).
- Add schema validation library and OpenAPI contracts.
- Add CI checks: tests, lint, SAST, dependency scanning.
