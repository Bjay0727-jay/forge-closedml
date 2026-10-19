# ADR-0008: Pilot GPU host on Hetzner, restricted to non-sensitive data

- Status: **Superseded in part by [ADR-0009](0009-workers-ai-for-non-restricted.md)** (2026-10-19): pilot inference moves to Workers AI; the Hetzner box is used only for Phase 4b training, rented around training runs. The data restrictions below still apply.
- Date: 2026-10-17

## Context
The pilot needs one 48 GB GPU host for serving 8B models, embeddings and QLoRA
fine-tuning. Cloudflare does not rent dedicated GPU servers; Workers AI serves
only Cloudflare's model catalog (plus LoRA adapters for some base models) and
cannot train custom models or carry restricted data. Forge has no on-prem GPU
yet.

## Decision
Rent a **Hetzner GEX130** (1× NVIDIA RTX 6000 Ada 48 GB) for the pilot. It runs
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

Step-up: GEX131 (96 GB Blackwell) if 32B+ models or larger fine-tunes are needed.

## Consequences
- + Fast and inexpensive to start; monthly billing, no hardware purchase.
- + Same containers move unchanged to customer premises or GovCloud later.
- − Cannot be used for regulated customer data; demos on real CUI/PHI need a
  compliant host.
- − EU data location; acceptable only because restricted data is excluded.
