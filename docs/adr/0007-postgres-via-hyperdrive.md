# ADR-0007: Control-plane database — managed US Postgres via Hyperdrive (replaces D1)

- Status: Proposed (decision confirmed by reviewer 2026-10-17)
- Date: 2026-10-17

## Context
The control plane stores metadata, audit events and approvals in D1. The
Cloudflare account is at its 10-database cap, so staging currently shares the
production D1 (README "Known pilot constraints" #1). The blueprint adds
relational, JSON-heavy tables (approvals, agent runs, role assignments), and
air-gap mode needs the same database on-prem.

## Decision
Move the control-plane database to **managed Postgres in a US region** (Neon
or AWS RDS; provider chosen at Phase 0.5 planning), reached from Workers
through **Cloudflare Hyperdrive** (connection pooling + query caching at the
edge). Separate databases for production and staging.

- Handlers depend on a small `Db` interface instead of `env.DB.prepare`, so
  the move is mechanical and air-gap uses the same code against on-prem Postgres.
- `0001_initial.sql` is ported to Postgres types (`TIMESTAMPTZ`, `JSONB`,
  `BOOLEAN`); a migration runner applies numbered migrations in order.
- No restricted content (CUI/PHI/classified) is stored here — same rule as D1.
- The database is kept off the GPU host so that host can be rebuilt or moved
  without touching records.

Alternatives: stay on D1 and raise the account cap (keeps SQLite limits and
a Cloudflare-only engine for air-gap); self-host Postgres on the GPU host
(cheapest, but audit data would sit on one EU server without managed backups).

## Consequences
- + Removes the D1 cap blocker; real staging isolation.
- + One database engine across hybrid and air-gap; `JSONB`, row-level
  security for future multi-tenant isolation; optional `pgvector`.
- − Adds an external provider to the boundary (covered as B7 in `04`), and
  per-query network latency (mitigated by Hyperdrive pooling/caching).
- − A one-time data migration from the pilot D1.
