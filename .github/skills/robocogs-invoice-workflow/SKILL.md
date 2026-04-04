---
name: robocogs-invoice-workflow
description: Use when invoice state transitions, submit/approve/reject flow, or workflow semantics are changed.
---

# RoboCOGS Skill: Invoice Workflow and State Transitions

Use this skill when changes affect invoice status/workflow transitions, submit/approve/reject behavior, or route compatibility shims.

## Source of Truth

- ARCHITECTURE.md
- src/lib/invoices/transition.ts
- src/app/api/invoices/submit/route.ts
- src/app/api/invoices/approve/route.ts
- src/app/api/invoices/reject/route.ts
- README.md

## Rules

1. Keep technical status and business workflow status distinct.
2. Use canonical transition endpoints and shared transition logic.
3. Preserve compatibility shims only when documented and intentionally temporary.
4. Keep transition side effects explicit and auditable.
5. Any transition rule change requires corresponding docs and tests.

## Validation Checklist

1. Verify allowed and denied transitions remain correct.
2. Verify audit-relevant fields are preserved across transitions.
3. Verify deprecated endpoint behavior still returns migration guidance.
4. Verify route-level and shared-transition tests remain aligned.

## Common Anti-patterns

- Embedding transition logic directly in route handlers without shared core.
- Mixing workflow semantics with technical processing states.
- Breaking backward compatibility without shim or migration path.