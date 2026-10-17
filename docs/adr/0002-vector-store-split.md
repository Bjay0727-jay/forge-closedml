# ADR-0002: Vector store split — Qdrant on-prem for restricted, Vectorize for public/internal

- Status: Proposed
- Date: 2026-10-17

## Context
Embeddings can leak source content. `classification_policies` restricts
`cui`, `phi`, `classified` to `on-prem`. Air-gap mode needs a vector store with
no cloud dependency.

## Decision
- Restricted classes and all air-gap tenants: **Qdrant** on-prem (dense +
  sparse vectors for hybrid search, per-tenant collections, payload filters).
- `public` / `internal`: **Cloudflare Vectorize**, gated by a new
  `vectorize` value in `allowed_destinations`.
- Handlers use a `VectorStore` interface; the backend is chosen per
  `knowledge_collections.vector_backend`, decided at collection creation from
  its classification via `enforceClassification`.

Alternative considered: pgvector — viable, but Qdrant's native sparse vectors
and filtering fit hybrid retrieval better. Revisit if we adopt Postgres.

## Consequences
- + Restricted vectors never leave the boundary.
- + Same code path in hybrid and air-gap.
- − Two backends to test; retrieval quality must be compared across both.
