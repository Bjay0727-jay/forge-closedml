# ADR-0008: Pilot GPU host on Hetzner, restricted to non-sensitive data

- Status: **Superseded in part by [ADR-0009](0009-workers-ai-for-non-restricted.md)** (2026-10-19): the cost-sensitive pilot runs on Cloudflare Workers AI. The GEX131 below is ordered only when the pilot needs what Workers AI cannot provide (security-specialist models, full fine-tuning, models outside its catalog). GPU size revised from GEX130 to GEX131 on 2026-10-19. The data restrictions below still apply.
- Date: 2026-10-17

## Context
The pilot GPU host must run, side by side, the model classes the reviewer
requires (2026-10-19): **70B-class LLMs**, **vision / document models**,
**security-specific models**, embeddings, and **Forge fine-tuned models**
(including QLoRA on a 70B base). A 48 GB card cannot hold a 4-bit 70B model
with useful context plus a vision model. Cloudflare does not rent dedicated GPU servers; Workers AI serves
only Cloudflare's model catalog (plus LoRA adapters for some base models) and
cannot train custom models or carry restricted data. Forge has no on-prem GPU
yet.

## Decision
Rent a **Hetzner GEX131** (1× NVIDIA RTX PRO 6000 Blackwell, 96 GB) for the
pilot. Indicative layout on the 96 GB card: 70B LLM in 4-bit (≈40 GB weights +
KV cache), a 7–12B vision/document model, a security-specific model, and the
embedding/reranker models, served by vLLM behind LiteLLM. Fine-tuning runs
off-hours on the same card (QLoRA on 70B fits in 96 GB); serving models are
unloaded during training runs. It runs
the on-prem stack from `docker-compose.yml` and connects to Cloudflare only
through the outbound-only `cloudflared` tunnel — no inbound ports.

Because Hetzner GPU servers are located in Germany / Finland and Hetzner has
no FedRAMP authorization and, to our knowledge, offers no HIPAA BAA (re-confirm before any PHI discussion), this host is registered as
allowed for **`public`, `internal` and synthetic data only**. The gateway
enforces this through the endpoint's `allowed_classifications`. CUI, PHI and
classified workloads go only to customer-premises hosts or a US FedRAMP /
GovCloud GPU host.

Hardening: Hetzner firewall deny-all inbound, full-disk encryption, SSH by key
via Cloudflare Access only, automatic security updates, nightly encrypted
backup of MinIO/MLflow/Qdrant volumes to R2 (non-restricted data only).

Step-up: a second GPU host (split serving and training) once load or training
frequency requires it. Rejected: GEX130 (48 GB) — too small for 70B + vision
on one card.

## Consequences
- + Fast and inexpensive to start; monthly billing, no hardware purchase.
- + Same containers move unchanged to customer premises or GovCloud later.
- − Cannot be used for regulated customer data; demos on real CUI/PHI need a
  compliant host.
- − EU data location; acceptable only because restricted data is excluded.
