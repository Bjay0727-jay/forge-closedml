# ADR-0004: Deterministic rules engine is authoritative over LLM judgments

- Status: Proposed
- Date: 2026-10-17

## Context
LLMs can be wrong confidently. Compliance determinations need repeatable,
explainable results.

## Decision
A `rules` service evaluates deterministic facts against OSCAL 800-53 Rev 5
catalogs and profiles: is evidence present, is it current, does a parameter
value meet the ODP, does a scan exceed thresholds. On any fact the rules engine
can decide, **its verdict wins**; the LLM assessor adds judgment only where no
deterministic rule exists, and disagreements are shown to the human, not
silently resolved. Neither produces a final conclusion — that is Gate G5.

## Consequences
- + Reproducible, testable verdicts; assessors can read the rule.
- + Limits hallucination impact.
- − Rules must be authored and maintained per framework; start with
  NIST 800-53 Moderate, then FedRAMP and CMMC profiles.
