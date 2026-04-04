---
name: robocogs-analytics-guardrails
description: Use when server analytics instrumentation or event semantics are modified.
---

# RoboCOGS Skill: Analytics Guardrails

Use this skill when work touches server routes/actions instrumentation or analytics event definitions.

## Source of Truth

- AGENTS.md
- scripts/validate-analytics.ts
- package.json (validate:analytics script)

## Rules

1. In server surfaces, use trackServerOperation with withPostHog wrappers where required.
2. Use only SERVER_ANALYTICS_EVENTS constants, never string literals.
3. Include required operation fields: distinctId, event, source, name, result, startedAt.
4. Include errorCode for failed, validation_failed, permission_denied, and rate_limited results.

## Validation Checklist

1. Run npm run validate:analytics after analytics edits.
2. Confirm event naming conventions remain compliant.
3. Confirm result and errorCode semantics are consistent across touched flows.

## Common Anti-patterns

- Using ad-hoc event strings in route/action files.
- Calling trackServerEvent in server operations where trackServerOperation is required.
- Emitting failed result events without errorCode when required.