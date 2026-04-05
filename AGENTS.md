# AGENTS — RoboCOGS Control Plane

This file is the canonical knowledge-base entry point for AI agents (GitHub Copilot, Codex, custom orchestration agents) working in this repository. Read it in full before starting any implementation work.

---

## What This Repository Is

`robocogs-control-plane` is the orchestration infrastructure for the RoboCOGS multi-agent team. It is a **Next.js 15 (App Router) / TypeScript** application that:

- Receives signed **GitHub webhooks** from the main `robocogs` repository.
- Manages **agent task state and gate approvals** via a **Turso (libSQL/SQLite)** database.
- Runs **async event-driven workflows** through **Inngest** functions (gate processor, CI checks, scope conflicts, etc.).
- Hosts the **Orchestration Control Surface** dashboard at `/admin/orchestration`.

This service is separate from the main `robocogs` application. It handles *process orchestration only* — no application business logic lives here.

---

## Repository Layout

```
src/
  app/
    admin/
      login/page.tsx          — Admin login page
      orchestration/page.tsx  — Orchestration dashboard (auth-gated)
      page.tsx                — Redirects to /admin/orchestration
    api/
      admin/
        login/route.ts        — POST form-based login
        logout/route.ts       — POST logout (clears session cookie)
        tasks/[taskId]/
          decision/route.ts   — POST approve/reject a gate from dashboard
          logs/route.ts       — GET task logs + plan package
      inngest/route.ts        — Inngest function server (GET|POST|PUT)
      orchestration/
        work-start/route.ts   — POST create/link task from `npm run work:start`
      webhooks/
        github/route.ts       — POST receive + validate GitHub webhooks
    layout.tsx                — Root HTML layout (system font, globals.css)
    page.tsx                  — Redirects to /admin/orchestration
    globals.css               — Tailwind base + system-font body

  components/
    agent-tasks-table.tsx     — Responsive task data table (client component)
    task-review-drawer.tsx    — Side drawer: gate status, logs, approve/reject form

  inngest/
    client.ts                 — Inngest client + all OrchestrationEvents type map
    gate-processor.ts         — Gate approval workflow + response parser
    task-lifecycle.ts         — Task creation, CI checks, status updates, etc.

  lib/
    admin-auth.ts             — HMAC-signed session cookie helpers
    db.ts                     — Turso client + typed query helpers (AgentTask, etc.)
    gates.ts                  — Gate question packs, approval transitions, timeline state
    github.ts                 — GitHub App client (Octokit), comment/dispatch helpers
    plan-package.ts           — Generates and serializes structured plan packages
    webhook-validator.ts      — HMAC-SHA256 webhook signature + replay validation

db/
  migrations/001_initial.sql  — Schema: agent_tasks, agent_logs, gate_approvals
```

---

## Agent Roles in the Orchestration System

The control plane orchestrates these agent roles (stored in `agent_tasks.assigned_agent`):

| Role | Responsibility |
|---|---|
| `architect` | Designs solution strategy, produces the plan package, owns intake and plan-approval gates |
| `implementer` | Executes the approved plan package, works on the tracked branch |
| `auditor` | Reviews implementation evidence, validates scope and quality |
| `domain-specialist` | Provides deep subject-matter expertise for a specific scope slice |
| `historian` | Records final audit trail, closes the task lifecycle |
| `concierge-router` | Routes incoming requests to the right agent or gate |

Agents are promoted by calling `setTaskAgent(taskId, newRole)` in `src/lib/db.ts`.

---

## Gate Lifecycle

Every orchestration task moves through ordered gates. Gate state is tracked in `agent_tasks.gate_current`.

```
intake  →  plan-approval  →  implementation  →  merge-approval  →  done
```

| Gate | Trigger | Approval Effect |
|---|---|---|
| `intake` | PR labeled `orchestration` or `work:start` call | Advances to `plan-approval`, generates plan package |
| `plan-approval` | Architect submits plan | Advances to `implementation`, assigns `implementer` |
| `merge-approval` | CI check suite succeeds | Advances to `complete` |
| `promotion-approval` | Optional for prod promotions | Advances to `complete` |

Gate approval commands (posted as GitHub comments):
```
approve <taskId> scope-clear=yes risk-assessed=yes
reject <taskId> reason=<text>
```

The `gate-response-handler` Inngest function parses incoming `issue_comment` webhooks and emits `orchestration/gate.approved` or `orchestration/gate.hard_blocked` events.

---

## Inngest Events

All events use the type map in `src/inngest/client.ts` (`OrchestrationEvents`). Key events:

| Event | Producer | Consumer |
|---|---|---|
| `orchestration/pr.labeled` | GitHub webhook route | `pr-labeled-handler` |
| `orchestration/task.created` | `pr-labeled-handler`, `work-start` route | `task-lifecycle` |
| `orchestration/gate.awaiting_approval` | `pr-labeled-handler`, CI handler | `gate-processor` |
| `orchestration/gate.response` | GitHub webhook (`issue_comment`) | `gate-response-handler` |
| `orchestration/gate.approved` | `gate-response-handler`, dashboard API | `gate-processor` (waitForEvent) |
| `orchestration/gate.hard_blocked` | `gate-response-handler` | `hard-block-processor` |
| `orchestration/ci.check_completed` | GitHub webhook (`check_suite`) | `ci-check-completed-handler` |
| `orchestration/commit.traceability_failure` | External CI scripts | `commit-traceability-handler` |
| `orchestration/session.scope_conflict` | Scope conflict detection | `scope-conflict-handler` |

---

## Database Schema

Three tables, defined in `db/migrations/001_initial.sql`:

- **`agent_tasks`** — Core task state (id, task_name, assigned_agent, status, progress, branch, issue_number, scope_slice, gate_current, timestamps).
- **`agent_logs`** — Append-only audit log per task (id, task_id, agent, message, level, created_at).
- **`gate_approvals`** — Approval history per gate (id, task_id, gate_name, approved_by, answers JSON, timestamps, comment metadata).

All query helpers are in `src/lib/db.ts`. Use those functions; do not write raw SQL outside of that file.

---

## Admin Authentication

The dashboard uses an HMAC-signed session cookie (`rc_admin_session`). Configuration:

```
ADMIN_UI_USERNAME=admin
ADMIN_UI_PASSWORD=<strong-password>
ADMIN_UI_SESSION_SECRET=<32+ char random string>
```

Session TTL: 12 hours. All auth logic is in `src/lib/admin-auth.ts`. The session cookie is `httpOnly`, `secure`, `sameSite: lax`.

---

## Environment Variables

| Variable | Purpose | Required |
|---|---|---|
| `TURSO_URL` | Turso database URL (`libsql://...`) | Production |
| `TURSO_AUTH_TOKEN` | Turso auth token | Production |
| `GITHUB_APP_ID` | GitHub App numeric ID | Production |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App RSA private key (PEM, `\n` escaped) | Production |
| `GITHUB_WEBHOOK_SECRET` | Webhook HMAC secret | Production |
| `INNGEST_EVENT_KEY` | Inngest event key | Production |
| `INNGEST_SIGNING_KEY` | Inngest signing key | Production |
| `ADMIN_UI_USERNAME` | Dashboard login username | Required |
| `ADMIN_UI_PASSWORD` | Dashboard login password | Required |
| `ADMIN_UI_SESSION_SECRET` | Session cookie signing secret | Required |
| `ORCHESTRATION_SHARED_SECRET` | Shared secret for `work:start` intake route | Required |
| `WEBHOOK_FORWARD_URL` | Bridge mode: upstream backend URL | Optional |
| `WEBHOOK_FORWARD_AUTH_MODE` | Bridge mode: `none` or `oidc` | Optional |
| `WEBHOOK_FORWARD_AUDIENCE` | Bridge mode: Cloud Run audience | Optional |

See `.env.example` for the full template.

---

## Development Workflow

```bash
npm install          # Install dependencies
npm run dev          # Start dev server on http://localhost:3001
npm run build        # Production build (must pass before merging)
npm run db:migrate   # Run DB migrations (requires Turso CLI)
```

The `npm run lint` command invokes `next lint`. For new code, TypeScript strict mode applies; do not suppress compiler errors with `any` casts unless there is a clear type-boundary reason documented inline.

## GitHub MCP Boundary

- Use GitHub MCP as a read-optimized surface for linked issue/PR context, review state, and status-check inspection when that reduces manual GitHub lookup.
- Keep orchestration writes on the existing control-plane path: GitHub App API calls, validated webhooks, Inngest events, and repository helper flows remain authoritative for lifecycle state changes.
- Do not treat this repo knowledge entry point or the versioned `docs/ORCHESTRATION_V1_*` contracts as a place to redefine support-content or knowledge-base policy.

---

## Coding Conventions

1. **Typed queries only.** Always use the helper functions in `src/lib/db.ts`. Do not call `db.execute()` directly outside that file.
2. **Inngest steps are idempotent.** Every `step.run(...)` block must be safe to retry.
3. **No secrets in source.** All credentials go in environment variables. The `.env.example` file shows the expected keys.
4. **Auth on every admin route.** Any new `/api/admin/*` route must call `isAdminSessionValid` before processing.
5. **Error isolation.** Catch and log errors in Inngest functions; don't let one task's failure cascade.
6. **Minimal diffs.** Make the smallest change that achieves the approved scope. Expand only when explicitly approved through the plan-approval gate.
7. **System font.** The app uses the system-font stack defined in `globals.css`. Do not add Google Fonts or external font imports.

---

## Webhook Security

- All GitHub webhooks are validated with **HMAC-SHA256** (`X-Hub-Signature-256`).
- Timing-safe comparison prevents timing attacks (`crypto.timingSafeEqual`).
- A 5-minute replay window is enforced via `validateReplayProtection`.
- In bridge mode (`WEBHOOK_FORWARD_URL` set), the ingress edge validates the signature and forwards with an optional Cloud Run OIDC token.

---

## Cross-Repo Integration

This control plane integrates with the main `robocogs` repo:

1. **Webhooks** — robocogs GitHub App delivers `check_suite`, `pull_request`, and `issue_comment` events here.
2. **GitHub API** — This service posts gate-question comments and resolves approvals back to robocogs PRs/issues.
3. **`work:start`** — The `npm run work:start` script in robocogs POSTs to `/api/orchestration/work-start` with the shared secret to register a new task.

---

## How to Add a New Gate

1. Add a `GatePack` entry to `GATE_QUESTION_PACKS` in `src/lib/gates.ts`.
2. Add a `case` to `getApprovalTransition()` in `src/lib/gates.ts` for the new gate's next state.
3. Update `getGateTimelineState()` in `src/lib/gates.ts` to include the new gate in the ordered list.
4. Add the gate name to the `GateName` type in `src/lib/gates.ts`.
5. Emit `orchestration/gate.awaiting_approval` with the new `gateName` and `questionPackId` to trigger the gate processor.
6. Update the task review drawer in `src/components/task-review-drawer.tsx` if new gate answers need custom UI.

---

## Related Documentation

- `README.md` — Architecture overview, setup guide, and deployment instructions.
- `IMPLEMENTATION_CHECKLIST.md` — Manual setup tasks (GitHub App, Turso, Cloud Run).
- `SESSION_SUMMARY.md` — Build history and architecture decisions.
- `.github/agent-config-governance.instructions.md` — Agent config authoring rules.
- `.github/agents/lead-architect-planner.agent.md` — Lead architect agent definition.
