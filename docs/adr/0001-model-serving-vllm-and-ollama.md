# ADR-0001: Model serving — vLLM for production, Ollama for dev

- Status: Proposed
- Date: 2026-10-17

## Context
The on-prem stack serves models with Ollama behind LiteLLM (`docker-compose.yml`,
`config/litellm-config.yaml`). Agent runs and batch evidence review need high
concurrent throughput; Ollama is optimized for simplicity, not batching.

## Decision
Add a `vllm` service for production serving (continuous batching, paged
attention, LoRA adapter hot-loading). Keep Ollama for developer machines and
small air-gap installs. Both sit behind LiteLLM, so the gateway contract
(`/v1/chat/completions` in `worker/src/handlers/inference.ts`) is unchanged;
switching is a LiteLLM `model_list` change.

## Consequences
- + 5–20× throughput on batch workloads; one adapter-per-tenant possible.
- + No gateway code change.
- − Two serving runtimes to patch; vLLM needs a CUDA GPU (no CPU fallback).
- Fine-tuned outputs are produced in safetensors (vLLM) and GGUF (Ollama).
