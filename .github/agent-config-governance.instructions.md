---
name: shared-agent-config-governance
description: "Use when: creating or editing agent-related customization files (.agent.md, .instructions.md, AGENTS.md, or copilot-instructions.md) across the RoboCOGS workspace."
applyTo: "**/{*.agent.md,*.instructions.md,AGENTS.md,copilot-instructions.md}"
---

# Shared Agent Configuration Governance

Apply these rules whenever defining or updating shared or repository-level agent configurations.

## Scope model

- The repo-versioned `.github-shared/` source in `robocogs/` is the canonical authoring source for shared workspace customizations.
- Repository `.github/` copies are runtime artifacts for local and cloud discovery.
- Repository-specific overlays may add local rules, but they must stay additive and avoid duplicating the shared baseline.

## Role Clarity

- Every agent must declare a single primary role.
- State authority boundaries and explicit non-goals.
- Prefer architect-first behavior for planning agents before implementation details.

## Discoverability

- Include trigger phrases in description using "Use when:" style.
- Keep names stable and descriptive.
- Avoid ambiguous overlap between agents with similar purposes.

## Output Contracts

- Prefer the minimum output structure needed for repeatable results.
- Include a quality bar with completion criteria.
- Require explicit assumptions and open questions only when they materially affect the result.
- Do not restate platform or runtime completion hooks, generic final-summary rules, or baseline progress-update cadence in repository files; local output contracts should add only repository-specific structure.

## Cross-Session Continuity

- Keep continuity lightweight: persist only decisions or open questions that are needed to resume effectively.
- Summarize deltas only when resuming prior work with meaningful changes.

## Workflow and Safety

- Respect repository workflow rules and validation gates.
- Do not bypass issue, branch, or PR guardrails when behavior changes are planned.
- Prefer GitHub MCP for GitHub read operations such as issue/PR context, search, and status-check discovery when that reduces redundant questioning or manual lookup.
- Allow low-risk GitHub MCP writes such as routine issue or PR comments only when they do not replace a repository-owned workflow helper or orchestration control path.
- Require explicit user confirmation before high-risk GitHub MCP writes such as issue or PR creation outside canonical helpers, label changes, closure/reopen actions, workflow triggers, merges, or comments that act as release or approval decisions.
- Preserve repository-owned lifecycle paths when they encode traceability or side effects. If a repository provides helpers like `work:start`, `work:pr`, `work:promote`, or a GitHub App orchestration flow, treat those as canonical over equivalent GitHub MCP mutations.
- Keep GitHub MCP workflow policy in governance and workflow instruction surfaces, not in knowledge-base or support-content sources unless a separate knowledge-policy change is explicitly approved.
- Avoid destructive git recommendations unless explicitly approved.
- Prefer a separate git worktree for concurrent issue-scoped sessions or when unrelated local changes must remain untouched.
- Treat git worktrees as workspace isolation only; if scope ownership or shared contracts overlap, escalate instead of parallelizing blindly.
- Before editing files for any issue-scoped task, verify that the active repository, branch, and worktree match the intended task checkout.
- If the active branch or worktree is unrelated to the task, stop and switch to the intended isolated checkout instead of editing in place.
- Do not reuse an unrelated branch or non-isolated checkout unless the user explicitly instructs that reuse.
- In multi-repo or shifting-context sessions, re-verify the active repository, branch, and worktree immediately before each edit batch.

## Scope Control

- Keep plans scoped to requested outcomes.
- Do not silently expand into unrelated architecture work.
- Separate must-do items from deferred improvements.
- When a higher-priority layer already enforces closure or progress behavior, document scope ownership instead of duplicating the rule text locally.