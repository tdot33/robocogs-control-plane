---
name: robocogs-gl-coding
description: Use when GL code formatting, category mapping, or template-driven account coding behavior is touched.
---

# RoboCOGS Skill: GL Coding Rules

Use this skill when changes touch category templates, category import cleanup, category suggestions, or line-item GL mapping.

## Source of Truth

- src/lib/categoryTemplates.ts
- src/lib/invoiceProcessing/publicCategoryTemplate.ts
- src/lib/categoryImport/categoryNameCleanup.ts
- docs/archive/LEAD_MAGNET_IMPLEMENTATION.md

## Rules

1. Treat GL code as canonical string data, not numeric data.
2. Resolve imported names by canonical GL code when available.
3. Keep alias sets deduplicated, trimmed, and deterministic.
4. Preserve safe fallback behavior for low-confidence mapping.
5. Avoid introducing ad-hoc code formatting patterns outside existing helpers.

## Validation Checklist

1. Confirm GL codes remain stable through import and mapping.
2. Confirm category name normalization still preserves canonical names.
3. Confirm fallback category behavior remains explicit and documented.
4. Confirm tests or fixtures cover changed mapping logic.

## Common Anti-patterns

- Converting GL code to number and losing leading/trailing semantics.
- Free-text category naming without canonical code tie-back.
- Silent fallback changes without audit notes.