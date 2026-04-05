# RoboCOGS Control Plane
# RoboCOGS Control Plane

Orchestration infrastructure for the RoboCOGS agent team, gate approval system, and task lifecycle management.

## Overview

This is a **separate Next.js application** that:
- Receives GitHub webhooks from the main robocogs repository
- Manages agent task state and orchestration events via Inngest
- Hosts the orchestration control surface dashboard at `/admin/orchestration`
- Processes gate approvals and manages approval workflows

## Architecture

```
GitHub Events (webhooks)
         ↓
  GitHub Webhook Route
         ↓
  Inngest Event Queue
         ↓
  Gate Processor / Task Lifecycle Functions
         ↓
  Turso SQLite Database
         ↓
  Control Surface UI (/admin/orchestration)
GitHub Events (webhooks)

## Prerequisites

- **Node.js** 18+
- **Turso CLI** (for database setup)
- **GitHub App** registered with webhook permissions
- Environment variables set (see below)

## Setup

```
### 1. Database

Create a Turso database:

```bash
turso db create robocogs-orchestration
turso db tokens create robocogs-orchestration
```

### 2. Environment Variables

Create `.env.local`:

```bash
# Turso Database
TURSO_URL=libsql://[db-name]-[org].turso.io
TURSO_AUTH_TOKEN=eyJ...

# GitHub App
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
GITHUB_WEBHOOK_SECRET=whsec_...

# Inngest
INNGEST_EVENT_KEY=evt_prod_...
INNGEST_SIGNING_KEY=signkey_prod_...

# Next.js
NEXT_PUBLIC_API_URL=http://localhost:3001

# Dashboard auth gate
ADMIN_UI_USERNAME=admin
ADMIN_UI_PASSWORD=change-me
ADMIN_UI_SESSION_SECRET=replace-with-long-random-secret

# Shared secret for upstream work:start intake
ORCHESTRATION_SHARED_SECRET=replace-with-shared-secret
```

### 3. Database Migrations

```bash
turso db shell robocogs-orchestration < db/migrations/001_initial.sql
```

### 4. Install Dependencies

```bash
npm install
```

For a dedicated git worktree, prefer:

```bash
npm run worktree:bootstrap
```

That command runs `npm ci --prefer-offline` when the worktree is missing dependencies or the lockfile/runtime changed, and it reports missing `.env.local` or `.env` files before you start local orchestration work.

### 5. Run Development Server

```bash
npm run dev
```

Visit http://localhost:3001/admin/orchestration

## API Routes

### Webhooks

- **POST** `/api/webhooks/github` — Receives signed GitHub webhook events
- **POST** `/api/orchestration/work-start` — Creates or links an orchestration task from `npm run work:start`

### Inngest

- **GET|POST|PUT** `/api/inngest/[...path]` — Inngest function server and event ingestion

## Database Schema

### `agent_tasks`

Core task state for orchestration:
- `id` (TEXT, PK) — Unique task identifier
- `task_name` — Human-readable task name
- `assigned_agent` — Agent role (architect, implementer, auditor, etc.)
- `status` — Current state (pending, running, awaiting_approval, etc.)
- `progress` — Completion percentage (0-100)
- `branch` — Associated git branch
- `issue_number` — Linked GitHub issue
- `scope_slice` — Module ownership scope
- `gate_current` — Current gate in stream (intake, plan-approval, etc.)
- `created_at`, `updated_at` — Timestamps

### `agent_logs`

Audit trail of task events:
- `id` (TEXT, PK)
- `task_id` (TEXT, FK) → agent_tasks
- `agent` — Source agent
- `message` — Log message
- `level` — Log level (info, warn, error, debug)
- `created_at` — Timestamp

### `gate_approvals`

Gate approval history:
- `id` (TEXT, PK)
- `task_id` (TEXT, FK) → agent_tasks
- `gate_name` — Gate name (intake, plan-approval, merge-approval, etc.)
- `approved_by` — GitHub username of approver
- `answers` — JSON stringified gate responses
- `approved_at` — Approval timestamp
- `comment_url` — GitHub comment URL
- `comment_id` — GitHub comment ID

## Inngest Functions

### Gate Processing

- `gate-processor` — Posts gate questions as GitHub comments, waits for founder approval
- `hard-block-processor` — Handles gate rejections (hard blocks)
- `gate-response-handler` — Parses GitHub approval/rejection comments and emits gate resolution events

### Task Lifecycle

- `pr-labeled-handler` — Creates orchestration tasks when a PR is labeled for orchestration and queues the intake gate
- `task-lifecycle` — Creates task records and manages initial state
- `status-update-handler` — Processes task state transitions
- `ci-check-completed-handler` — Advances successful tasks to merge approval or fails them on CI errors
- `commit-traceability-handler` — Logs commit metadata failures
- `scope-conflict-handler` — Manages parallel session scope conflicts

## GitHub Automation Flow

1. A PR in the main `robocogs` repo is labeled `orchestration`.
2. `/api/webhooks/github` emits `orchestration/pr.labeled`.
3. Control plane creates an `agent_tasks` record and opens the `intake` gate by posting a GitHub comment.
4. Founder replies on the PR with `approve <taskId> ...` or `reject <taskId> ...`.
5. Control plane parses the comment, records approval history, and resolves the active gate.
6. After intake approval, the task moves to `running` while implementation/CI proceeds.
7. A successful `check_suite` completion opens `merge-approval`; failed CI marks the task failed.
8. Founder approval on `merge-approval` completes the task.

## Control Surface Dashboard

**Route:** `/admin/orchestration`
**Login:** `/admin/login`

Features:
- Real-time task list showing all active orchestration tasks
- Status badges and progress indicators
- Mobile-responsive card and table views
- "Review Implementation" drawer with code diff, gate status, and approval toggle
- Activity logs and audit trail

## Webhook Security

All GitHub webhooks are validated using:
- **HMAC-SHA256** signatures (`X-Hub-Signature-256` header)
- **Timing-safe comparison** to prevent timing attacks

In bridge mode, validated payloads are forwarded with optional Cloud Run OIDC service-to-service authentication (`WEBHOOK_FORWARD_AUTH_MODE=oidc`).

## Cross-Repo Integration

This control plane is linked to the main robocogs repo via:

1. **Webhook delivery** — robocogs GitHub Actions emit events to this service
2. **GitHub API** — control plane dispatches workflows and posts comments back to robocogs PRs
3. **Event schema** — All events use the shared v1 schema defined in robocogs `docs/ORCHESTRATION_V1_EVENT_SCHEMAS.json`

## Deployment

### Local Development

```bash
npm run dev
```

### Production (GCP Cloud Run)

```bash
docker build -t robocogs-control-plane .
gcloud run deploy robocogs-control-plane \
  --image robocogs-control-plane \
  --set-env-vars TURSO_URL=...,GITHUB_APP_ID=...,etc
```

## Documentation

- [Orchestration V1 Webhook Security Spec](../robocogs/docs/ORCHESTRATION_V1_WEBHOOK_SECURITY_SPEC.md)
- [Orchestration V1 Event Schemas](../robocogs/docs/ORCHESTRATION_V1_EVENT_SCHEMAS.json)
- [Cross-Repo Implementation Checklist](../robocogs/docs/ORCHESTRATION_V1_CROSS_REPO_IMPLEMENTATION_CHECKLIST.md)

## License

Same as main robocogs repository

### Ingress Bridge Model (recommended with strict org policy)

Deploy two Cloud Run services:

1. Private backend service (no unauthenticated access):

```bash
gcloud run deploy robocogs-control-plane \
       --source . \
       --region northamerica-northeast2 \
       --platform managed \
       --no-allow-unauthenticated \
       --service-account "robocogs-control-plane-sa@<project>.iam.gserviceaccount.com" \
       --set-env-vars "NODE_ENV=production" \
       --set-secrets "TURSO_URL=TURSO_URL:latest,TURSO_AUTH_TOKEN=TURSO_AUTH_TOKEN:latest,GITHUB_APP_ID=GITHUB_APP_ID:latest,GITHUB_APP_PRIVATE_KEY=GITHUB_APP_PRIVATE_KEY:latest,GITHUB_WEBHOOK_SECRET=GITHUB_WEBHOOK_SECRET:latest"
```

2. Public bridge service in a project where public ingress is allowed:

```bash
gcloud run deploy robocogs-webhook-bridge \
       --source . \
       --region northamerica-northeast2 \
       --platform managed \
       --allow-unauthenticated \
       --service-account "robocogs-webhook-bridge-sa@<public-project>.iam.gserviceaccount.com" \
       --set-env-vars "NODE_ENV=production,WEBHOOK_FORWARD_URL=https://<private-service-url>/api/webhooks/github,WEBHOOK_FORWARD_AUTH_MODE=oidc,WEBHOOK_FORWARD_AUDIENCE=https://<private-service-url>" \
       --set-secrets "GITHUB_WEBHOOK_SECRET=GITHUB_WEBHOOK_SECRET:latest"
```

3. Grant bridge service account invoke permission on private backend:

```bash
gcloud run services add-iam-policy-binding robocogs-control-plane \
       --region northamerica-northeast2 \
       --member="serviceAccount:robocogs-webhook-bridge-sa@<public-project>.iam.gserviceaccount.com" \
       --role="roles/run.invoker"
```

4. Set GitHub App Webhook URL to bridge endpoint:

```
https://<bridge-service-url>/api/webhooks/github
```
