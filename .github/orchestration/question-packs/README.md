# Orchestration Question Packs

Structured question packs for click-first gate decisions.

## Pack files

- intake.json
- plan-approval.json
- scope-lock.json
- audit-disposition.json
- merge-approval.json
- promotion-approval.json

## Usage

1. Load the gate pack that matches the current workflow stage.
2. Present options as fixed-choice prompts.
3. Enforce hardBlock rule before moving to the next gate.
4. If confidence is low, run clarification mini-pack before gate progression.

## Clarification Mini-pack (low confidence)

1. Behavior change vs docs/chore/refactor.
2. Existing issue yes/no.
3. Standard feature/fix/hotfix flow yes/no.