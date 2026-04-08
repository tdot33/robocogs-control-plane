---
applyTo: "**"
---

# GitHub Copilot Instructions — RoboCOGS Control Plane

This file provides repository-level context for GitHub Copilot (chat and completions). Read it before generating or reviewing any code in this repository.

## What This Repo Does

`robocogs-control-plane` is the **orchestration infrastructure** for the RoboCOGS multi-agent team. It is a **Next.js 15 App Router / TypeScript** application that:

- Receives and validates signed GitHub webhooks from the `robocogs` repo.
- Manages agent task state and gate approvals through a Turso (libSQL/SQLite) database.
- Runs async workflows through Inngest event functions.
- Hosts the admin Orchestration Control Surface at `/admin/orchestration`.

See `AGENTS.md` for the full knowledge-base reference (roles, gates, events, schema, conventions).

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router), TypeScript strict |
| Database | Turso (libSQL/SQLite) via `@libsql/client` |
| Async workflows | Inngest v3 (`inngest`, `@inngest/next`) |
| GitHub integration | GitHub App via `@octokit/app` + `@octokit/rest` |
| Styling | Tailwind CSS v3 + `clsx` + `tailwind-merge` |
| Icons | `lucide-react` |
| Validation | `zod` |

## Project Conventions

### Code Style
- TypeScript strict mode. Do not use `any` unless at a type boundary with a clear inline comment.
- Named exports preferred over default exports for library functions.
- No Google Fonts or external font imports. The app uses the system-font stack in `globals.css`.

### Database
- All database access goes through the typed helpers in `src/lib/db.ts`.
- Do not call `db.execute()` directly outside `src/lib/db.ts`.
- Migrations live in `db/migrations/`. Increment the numeric prefix for each new migration file.

### Inngest Functions
- Every `step.run(...)` block must be idempotent and safe to retry.
- Always catch errors inside Inngest handlers; never let one task's failure propagate to the top-level function throw unless you intend to retry the entire function.
- Function IDs are kebab-case and must be stable (changing them creates duplicate functions in Inngest).

### Auth and Security
- Every `/api/admin/*` route must call `isAdminSessionValid` from `src/lib/admin-auth.ts` before processing any request.
- Webhook signature validation must use `validateWebhookSignature` from `src/lib/webhook-validator.ts`.
- Never log secrets, tokens, or private keys.
- Use `crypto.timingSafeEqual` for all secret comparison operations.

### Client vs Server Components
- Dashboard UI at `src/app/admin/orchestration/page.tsx` is a **server component** that fetches data directly.
- Interactive components (`agent-tasks-table.tsx`, `task-review-drawer.tsx`) use `'use client'` and receive data as props.
- Do not add `useState` or `useEffect` to server components.

### API Routes
- All API routes must return proper HTTP status codes (200, 201, 202, 400, 401, 404, 500).
- Webhook receiver returns **202 Accepted** (async processing via Inngest — not 200).
- Validate all user/external inputs with `zod` or explicit type narrowing.

## Gate Lifecycle (Core Concept)

Tasks move through gates in order: `intake → plan-approval → implementation → merge-approval → done`.

- Gate state is tracked in `agent_tasks.gate_current`.
- Gate question packs and approval transitions are in `src/lib/gates.ts`.
- The `gate-processor` Inngest function posts GitHub comments and waits for founder approval.
- Approvals arrive as `issue_comment` webhooks, are parsed by `gate-response-handler`, and resolve the waiting `gate-processor` via `step.waitForEvent`.

## Making Changes

Before writing any code:
1. Confirm the task is within the approved gate scope.
2. For any issue-scoped task, verify the intended repository, branch, and worktree before editing; if the current checkout is unrelated, switch to the correct isolated checkout instead of editing in place.
3. Re-verify repository, branch, and worktree immediately before each edit batch in multi-repo or shifting-context sessions.
4. Make the **smallest possible diff** and use a dedicated worktree for concurrent local work. Prefer `npm run worktree:add -- --branch=<name>` and run `npm run worktree:bootstrap` there before implementation when needed.
5. Treat git worktrees as local isolation only; if the requested change overlaps a shared contract, gate, or migration path, escalate instead of assuming parallel work is safe.
6. After any change to API routes, Inngest functions, or database helpers, run `npm run build` to confirm no TypeScript errors.
7. Do not modify `db/migrations/001_initial.sql`. Add a new numbered migration file for schema changes.
8. When a cross-repo task changes canonical product truth or support-facing workflow semantics in `robocogs`, keep the matching curated KB docs aligned in that repo and point implementers to `robocogs/docs/KB_SOURCE_OF_TRUTH.md`.

## GitHub MCP usage

- Prefer GitHub MCP for GitHub read operations such as linked issue or PR context, review state, duplicate discovery, and status-check inspection.
- Low-risk GitHub MCP writes such as routine issue or PR comments are acceptable only when they do not replace the control-plane GitHub App, webhook, or Inngest orchestration path.
- Keep GitHub App writes, webhook-driven state changes, gate approvals, workflow dispatch, and other orchestration lifecycle mutations on the existing Octokit and Inngest control path.
- Require explicit user confirmation before any high-risk GitHub MCP write such as issue or PR creation outside canonical helpers, labels, closure or reopen actions, workflow triggers, merges, or comments that act as approvals.
- Keep GH MCP workflow policy in instruction and governance surfaces, not in knowledge-base content or the versioned `docs/ORCHESTRATION_V1_*` cross-repo contracts.

## Running Locally

```bash
npm install
cp .env.example .env.local   # fill in credentials
npm run dev                   # http://localhost:3001
```

The Inngest dev server runs at `http://localhost:8288` when started with `npx inngest-cli@latest dev`.

## Deployment

Deployed to GCP Cloud Run. See `README.md` for full deployment commands and the ingress bridge model for organizations with strict public-ingress policies.
