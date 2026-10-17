# ADR-0006: Air-gap runtime — same Worker code on workerd with local adapters

- Status: Proposed
- Date: 2026-10-17

## Context
Some customers require the entire platform inside their boundary with no
internet path. Maintaining a second codebase is not acceptable.

## Decision
Run the same gateway Worker on **workerd** (Cloudflare's open-source Workers
runtime) on-prem. Platform services are reached through interfaces with local
implementations:

| Interface | Cloudflare | Air-gap |
|---|---|---|
| Metadata DB | D1 | SQLite (same migrations) |
| `ObjectStore` | R2 | MinIO |
| `VectorStore` | Vectorize / Qdrant | Qdrant |
| `WorkflowRunner` | Workflows + DO | local SQLite-backed runner |
| `IdentityVerifier` | CF Access JWKS | Keycloak OIDC JWKS (same claims) |
| KV | KV | SQLite table |

Releases ship as **signed offline bundles** (image digests, model weights,
migrations, SBOM). Verified before import.

## Consequences
- + One codebase; air-gap is a deployment profile per tenant.
- − Adapter parity must be tested in CI (Phase 4c adds an air-gap test job).
- − Some Cloudflare-only features (Access policies UI, WAF) are replaced by
  local equivalents and documented per install.
