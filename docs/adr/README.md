# Architecture Decision Records

Short records of significant design choices. Status values: `Proposed`,
`Accepted`, `Superseded by ADR-NNNN`. A record moves to `Accepted` when the PR
that introduces it is approved and merged (Gate G0).

| ADR | Title | Status |
|---|---|---|
| [0001](0001-model-serving-vllm-and-ollama.md) | Model serving: vLLM for production, Ollama for dev | Proposed |
| [0002](0002-vector-store-split.md) | Vector store split: Qdrant on-prem for restricted, Vectorize for public/internal | Proposed |
| [0003](0003-orchestration-workflows-durable-objects.md) | Agent orchestration on Cloudflare Workflows + Durable Objects | Proposed |
| [0004](0004-rules-engine-authority.md) | Deterministic rules engine is authoritative over LLM judgments | Proposed |
| [0005](0005-predictive-stack.md) | Predictive stack: LightGBM + MLflow + FastAPI scorer | Proposed |
| [0006](0006-air-gap-runtime.md) | Air-gap runtime: same Worker code on workerd with local adapters | Proposed |
