# ForgeClosedML

A closed-boundary ML control plane for Forge Cyber Defense.

Cloudflare hosts the secure control plane (API gateway + dashboard). Model
inference stays on-prem behind an outbound-only Cloudflare Tunnel — nothing
listens on the on-prem firewall; the tunnel dials out. The worker is the only
externally reachable surface, and every privileged action is audited.

## Repository layout

```txt
forge-closedml/
  worker/         # Cloudflare Worker API gateway (TypeScript)
  dashboard/      # React + TypeScript + Vite control-plane UI
  config/         # Tunnel + LiteLLM + Ollama config templates
  docker-compose.yml   # On-prem stack (Ollama, LiteLLM, MLflow, cloudflared)
```

---

## Architecture summary

```
┌────────────────────── Cloudflare edge ──────────────────────┐
│                                                             │
│   Dashboard (static assets on Workers/Pages)                │
│         │ same-origin fetch                                 │
│         ▼                                                   │
│   Worker /api/*  /v1/chat/completions  /api/audit/export    │
│     │  auth  → classify  → rbac  → rate-limit → audit       │
│     │  D1 (models, versions, endpoints, inference_logs,     │
│     │      audit_events, promotion_approvals, policies)     │
│     │  KV (rate-limit counters, inference cache)            │
│     │  R2 (model artifact bucket, MODEL_BUCKET binding)     │
│     ▼                                                       │
│                                                             │
└─ outbound-only HTTPS to ──────────────────────────────────── ┘
                                       │
                                       ▼
┌────────────────── On-prem (private network) ───────────────┐
│  cloudflared tunnel  (dials out; no inbound firewall hole) │
│     ├─ litellm:4000  ─► ollama:11434  (model inference)    │
│     └─ mlflow:5000   (experiment + registry)               │
│                 optional redis:6379 (litellm cache)        │
└────────────────────────────────────────────────────────────┘
```

Key properties:

- **Closed boundary.** Inference never leaves on-prem; only control-plane
  metadata and audit records live in Cloudflare.
- **Identity-gated.** Every `/api/*` and `/v1/*` request requires a Cloudflare
  Access JWT, a CF Access service token, or an internal bearer token.
- **Classification-aware.** Every inference call carries an
  `X-Data-Classification` header that is validated against
  `classification_policies` in D1 before the request is forwarded.
- **Two-person governance.** Promotion to `production` requires two distinct
  approver identities recorded in `promotion_approvals`.
- **Evidence-first audit.** Every privileged action writes to `audit_events`
  with a `conmon_period` column; `/api/audit/export` returns a signed JSON
  bundle for the period.

---

## MVP endpoints

| Endpoint                              | Method | Permission        | Purpose |
| ------------------------------------- | ------ | ----------------- | ------- |
| `/v1/chat/completions`                | POST   | `inference:invoke` | OpenAI-compatible inference proxy (streams from on-prem LiteLLM). |
| `/api/dashboard/stats`                | GET    | authenticated     | KPI snapshot for the UI. |
| `/api/dashboard/timeline`             | GET    | authenticated     | Daily inference rollup (1–90 days). |
| `/api/dashboard/usage`                | GET    | authenticated     | Per-model request/error/latency. |
| `/api/models`                         | GET    | `models:read`     | List models (optional `?state=`). |
| `/api/models`                         | POST   | `models:write`    | Register a new model + initial version. |
| `/api/models/:id/promote`             | POST   | `models:promote`  | Transition lifecycle state or rollback. |
| `/api/endpoints`                      | GET    | `endpoints:read`  | List on-prem endpoints. |
| `/api/endpoints`                      | POST   | `endpoints:write` | Register an on-prem endpoint. |
| `/api/endpoints/:id/health`           | POST   | `endpoints:health`| Push a health/status update. |
| `/api/inference-logs`                 | GET    | authenticated     | Recent inference log rows. |
| `/api/audit`                          | GET    | `audit:read`      | Query audit events with filters. |
| `/api/audit/export?conmon_period=…`   | GET    | `audit:read`      | Signed evidence bundle for a ConMon period. |
| `/api/policy-violations`              | GET    | `audit:read`      | Classification violations + critical events. |
| `/health`, `/ready`                   | GET    | public            | Liveness and readiness. |

See `worker/src/index.ts` for the full router.

---

## Security + governance controls

- **Identity.** Cloudflare Access JWT (RS256, JWKS-verified with 5-minute
  cache) OR CF Access service-token pair OR constant-time-compared bearer
  token. No hard-coded secrets; everything is loaded from `env` bindings.
- **RBAC.** Roles derived from Access groups: `viewer`, `operator`, `approver`,
  `admin`, `service` (see `worker/src/middleware/rbac.ts`).
- **Classification policy.** `X-Data-Classification` is required on inference
  requests; mismatched header/body is a 400; blocked destinations log a
  `critical`-severity `classification.violation` audit event and return 403.
  PHI additionally requires `X-PHI-Tokenized: true` when the policy sets
  `tokenization_required=1`.
- **Request size limit.** 1 MB via `Content-Length` check.
- **Rate limiting.** Per-identity, per-minute KV counter (default 120/min).
- **JSON validation.** Explicit checks on every body (`messages[]`,
  `target_state`, `service_type`, etc.) — no `any`-typed passthrough.
- **Structured audit.** Every privileged action writes a row with severity,
  actor, resource, request ID, IP, country, and ConMon period.
- **Model lifecycle.** `dev → staged → approved → production`, with
  `quarantined` as a terminal bypass. Transitions enforced in
  `worker/src/handlers/models.ts`.
- **Two-person approval.** Production transitions require two distinct
  approver identities; first approval returns `pending_second_approval`.
- **Rollback.** `POST /api/models/:id/promote { rollback_to_previous: true }`
  replays the `from` state recorded in the last `model.promoted` audit event.
- **Provenance placeholders.** `models.artifact_signature`,
  `models.provenance_uri`, and mirroring columns on `model_versions`
  accept signed bundle references today and are ready for Sigstore/cosign.
- **Evidence export.** `/api/audit/export` emits an HMAC-SHA256-signed JSON
  bundle (`schema: forge.audit.evidence-bundle.v1`) for one ConMon period.
  The HMAC placeholder is labeled `key_id: api-secret` and is intended to be
  replaced with an HSM-backed signer before pilot.

---

## D1 schema

Defined in `worker/migrations/0001_initial.sql`:

- `models`, `model_versions`
- `endpoints`
- `inference_logs`
- `audit_events` (indexed by `conmon_period`)
- `promotion_approvals`
- `classification_policies` (seeded with public/internal/cui/phi/classified)
- `system_config`

---

## Local development

```bash
# Worker
cd worker
npm install
cp .dev.vars.example .dev.vars      # fill in values
npm run db:migrate:local            # create local D1 + apply schema
npm run dev                          # wrangler dev on :8787

# Dashboard (separate terminal)
cd ../dashboard
npm install
npm run dev                          # vite on :5173 (proxies /api and /v1 → :8787)

# Tests + typecheck
cd ../worker && npm run test && npm run typecheck
cd ../dashboard && npm run typecheck
```

### On-prem stack (separate host)

```bash
cp .env.example .env                 # fill in LITELLM_MASTER_KEY etc.
docker compose up -d                 # starts ollama, litellm, mlflow, cloudflared
```

The cloudflared service reads `config/cloudflared-tunnel.yml`. Replace
`<TUNNEL_ID>` after running `cloudflared tunnel create forge-closedml` and
mount the generated credentials file into `/etc/cloudflare/<TUNNEL_ID>.json`.

---

## Deployment checklist

Cloudflare side (control plane):

- [ ] `wrangler d1 create forge-closedml-db` and paste the id into `wrangler.toml`.
- [ ] `wrangler kv namespace create INFERENCE_CACHE` and paste the id into `wrangler.toml`.
- [ ] `wrangler r2 bucket create forge-closedml-models`.
- [ ] `wrangler d1 execute forge-closedml-db --file=./migrations/0001_initial.sql`.
- [ ] Put secrets: `wrangler secret put API_SECRET`, `LITELLM_ENDPOINT`,
      `MLFLOW_ENDPOINT`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`.
- [ ] Set `[vars]` in `wrangler.toml` for `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`,
      `ACCESS_JWKS_URL`, `RATE_LIMIT_PER_MINUTE`, `CORS_ALLOWED_ORIGIN`.
- [ ] Configure Cloudflare Access application for the worker hostname with the
      groups `admin`, `ml-operator`, `ml-approver`.
- [ ] Deploy worker: `cd worker && npm run deploy`.
- [ ] Build + deploy dashboard (Pages or Workers static assets):
      `cd dashboard && npm run build` and publish `dist/`.
- [ ] Verify dashboard origin is allow-listed via `CORS_ALLOWED_ORIGIN` (or
      served same-origin).

On-prem side:

- [ ] Provision host with Docker, NVIDIA runtime if GPU, outbound HTTPS only.
- [ ] `cloudflared tunnel login` then `cloudflared tunnel create forge-closedml`.
- [ ] Populate `config/cloudflared-tunnel.yml` with tunnel id + credentials path.
- [ ] Place the fine-tuned GGUF next to `config/Modelfile.forge-compliance`
      and `ollama create forge-compliance -f Modelfile.forge-compliance`.
- [ ] `docker compose up -d` (add `--profile optional` if you want Redis).
- [ ] Register the endpoint from the dashboard **Endpoints → Register** with
      `internal_url=http://litellm:4000`, `external_host=inference.<your-domain>`.
- [ ] Use CF Access service tokens for the on-prem health-push cron.

Governance:

- [ ] Seed `classification_policies` for your tenant (defaults are permissive
      for on-prem only; adjust per engagement).
- [ ] Confirm two distinct identities are required to promote to `production`
      by running a dry-run promotion and checking
      `event_type='model.promotion.approval_recorded'` in the audit log.
- [ ] Schedule a monthly `/api/audit/export?conmon_period=YYYY-QN` and archive
      the signed bundle with your ConMon package.

---

## Smoke test checklist

Run after every deploy. Each step should pass without intervention.

1. **Liveness** — `curl https://<worker-host>/health` returns
   `{"success":true,"status":"healthy"}`.
2. **Readiness** — `curl https://<worker-host>/ready` returns
   `{"checks":{"db":true,"cache":true}}`.
3. **Auth enforced** — `curl https://<worker-host>/api/models` with no auth
   returns 401 and an `auth.denied` audit row.
4. **Classification required** — `POST /v1/chat/completions` with no
   `X-Data-Classification` returns 400 and an `inference.blocked` audit row.
5. **Classification violation logged critical** —
   `X-Data-Classification: classified` with `destination=cloud` is rejected
   with 403 and a `classification.violation` audit event at `critical`.
6. **Inference happy path** — valid bearer + classification returns a 200 with
   `forge_metadata.request_id`, and an `inference.completed` audit row
   appears.
7. **Rate limit** — send >`RATE_LIMIT_PER_MINUTE` requests in a minute; the
   next request returns 429 with `Retry-After: 60`.
8. **Model lifecycle** — register → promote to `staged` → promote to
   `approved` succeeds; promotion to `production` returns
   `pending_second_approval: true` on first approver; the second distinct
   identity flips it live.
9. **Rollback** — `POST /api/models/:id/promote { rollback_to_previous: true }`
   reverts to the `from` state of the most recent `model.promoted` event.
10. **Audit export signed** — `GET /api/audit/export?conmon_period=YYYY-QN`
    returns a JSON bundle whose `signature.value` recomputes on the client
    with the shared `API_SECRET`.
11. **Dashboard round-trip** — Open the dashboard → Dashboard tab shows live
    KPIs; Models → Endpoints → Inference Logs → Audit Events → Policy
    Violations all render without console errors.

---

## Assumptions

1. **Identity provider.** Cloudflare Access is the source of truth for human
   identity. Group membership (`admin`, `ml-operator`, `ml-approver`) is
   provisioned in the IdP or Access policies, not in D1.
2. **Tenant scope.** MVP is single-tenant (`tenant_id='forge'`). The schema
   keeps `tenant_id` on every row so multi-tenancy is a routing change, not
   a migration.
3. **Classification policy.** Defaults seeded in `0001_initial.sql` restrict
   CUI/PHI/classified to on-prem only. Tune per engagement.
4. **Default model.** Inference falls back to `system_config.default_model`
   (`llama-3.1-8b`) when the request omits `model`.
5. **ConMon period.** Quarterly (`YYYY-QN`) as computed at audit-write time.
   Monthly periods would be a one-line change in `audit.ts`.
6. **Signing.** `audit/export` HMAC-signs with `API_SECRET`. This is a
   placeholder — production should move to an HSM-held key + detached
   signature (Sigstore/cosign).
7. **No PII in inference logs.** Only tokens/latency/status are persisted.
   Prompt/response content is intentionally not stored server-side.
8. **Size limit enforcement.** Currently driven by `Content-Length` header.
   Chunked requests without a declared length are not length-enforced; this
   is acceptable under the Worker body-size ceiling (100 MB) but listed as a
   hardening TODO.

---

## Hardening TODOs

- [ ] Replace HMAC audit-bundle signing with HSM-backed detached signature
      (Sigstore/cosign) and publish the public verifier.
- [ ] Move the R2 path (`MODEL_BUCKET`) from placeholder to a real model
      artifact ingest flow with hash verification + optional signature.
- [ ] Enforce request-size limits on chunked/no-length bodies via streaming
      bounds (currently only `Content-Length` is checked).
- [ ] Replace the in-code RBAC table with policy-as-code (OPA / Cedar) and
      expose the policy bundle for review.
- [ ] Add Durable Object / Queue offload for large ConMon exports
      (> 50k events).
- [ ] Extend JWKS test coverage for key rotation + signature-failure modes.
- [ ] CI pipeline: typecheck, unit tests, SAST (semgrep), dependency
      scanning, and wrangler dry-run deploy on every PR.
- [ ] OpenAPI contract + schema-validation library (zod) rather than
      hand-rolled guards.
- [ ] End-to-end secret-rotation automation (Access service tokens,
      `API_SECRET`).
- [ ] Multi-tenant hardening: per-tenant KV/D1 rate-limit isolation and
      per-tenant Access applications.
