# ADR-0009: Cloudflare Workers AI for non-restricted inference

- Status: Proposed (decision confirmed by reviewer 2026-10-19)
- Date: 2026-10-19
- Supersedes in part: [ADR-0008](0008-pilot-gpu-hosting-hetzner.md); extends [ADR-0001](0001-model-serving-vllm-and-ollama.md)

## Context
Phases 3a–3d (knowledge search, drafting, analysis, agents) need generation,
embeddings and reranking. ADR-0008 planned a rented Hetzner GPU for the pilot,
limited to public/internal/synthetic data. Cloudflare Workers AI offers the
same class of open models (Llama, Mistral, Qwen, `bge` embeddings, rerankers)
on Cloudflare's GPUs, billed per use, with a Worker binding and no server to run.

## Decision
- Workers AI serves generation, embeddings and reranking for **`public` and
  `internal`** data only.
- It is **never** used for `cui`, `phi` or `classified` data, and never for
  air-gap tenants. Those always go to an own-GPU host (customer premises or
  US GovCloud) through the tunnel and LiteLLM.
- Enforcement reuses the existing policy check: a new destination value
  `workers-ai` in `classification_policies.allowed_destinations`, seeded for
  `public` and `internal` only, checked by `enforceClassification()` in
  `worker/src/middleware/classify.ts` before every call. Tenants can remove
  it to force all inference onto their own GPU.
- Forge fine-tuned models are served from the own-GPU path. Workers AI LoRA
  adapters may be used later only for public/internal tenants and only on the
  base models Workers AI supports.
- Training (Phase 4b) runs on a GPU rented around training runs (Hetzner
  GEX130 per ADR-0008), not on Workers AI.

## Not assumed
FedRAMP or HIPAA coverage of Workers AI is **not assumed**. If a tenant needs
either for public/internal workloads, confirm Cloudflare's current
authorization scope first, or set that tenant to own-GPU only.

## Consequences
- + No GPU server to buy, patch or monitor for Phases 3a–3d; pay per use.
- + A public/internal MVP runs entirely on Cloudflare.
- − Model choice is limited to the Workers AI catalog for that path.
- − Two inference paths to test; a collection's embeddings must come from one
  model (Workers AI `bge` or on-prem `bge-m3`), never mixed.
- − Prompts for public/internal data are processed on Cloudflare GPUs, within
  the existing Cloudflare relationship.
