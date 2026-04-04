---
name: robocogs-tax-totals
description: Use when tax extraction, totals reconciliation, or financial line synthesis behavior is touched.
---

# RoboCOGS Skill: Tax and Totals Reconciliation

Use this skill when changes touch extraction totals, line synthesis, invoice post-processing, or reconciliation behavior.

## Source of Truth

- src/lib/invoiceProcessing/pipeline.ts
- src/lib/invoiceProcessing/stages/postprocess.ts
- src/lib/invoiceProcessing/stages/postprocessShared.ts
- db/migrations/00_core_schema_bootstrap.sql

## Rules

1. Preserve top-level extracted totals as auditable fields.
2. Keep synthesized tax/shipping line behavior explicit when used.
3. Avoid hidden reconciliation logic that can mask extraction defects.
4. Prefer deterministic reconciliation steps before heuristic fallback.
5. Any change to totals behavior must include rollback-safe notes.

## Validation Checklist

1. Verify line totals and invoice totals reconcile or surface explicit exceptions.
2. Verify tax and shipping handling remains traceable in payload and storage.
3. Verify post-processing does not drop financially relevant lines silently.
4. Verify regression coverage for edge cases (missing totals, duplicated lines, OCR noise).

## Common Anti-patterns

- Implicitly mutating totals without recording rationale.
- Conflating tax and shipping semantics into generic adjustment lines.
- Treating reconciliation mismatch as success without user-visible handling.