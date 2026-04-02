# Control-Plane Implementation Tasks

## ✅ Completed

- [x] Project scaffold (Next.js 15, TypeScript, Tailwind)
- [x] Database client (Turso libSQL)
- [x] GitHub App client (Octokit)
- [x] Webhook validator (HMAC-SHA256)
- [x] Inngest client and event types
- [x] Gate processor function (posts questions, waits for approval)
- [x] Hard-block processor function
- [x] Task lifecycle function
- [x] Status update handler
- [x] Commit traceability handler
- [x] Scope conflict handler
- [x] GitHub webhook route (validates and routes events)
- [x] Inngest serve route
- [x] Database schema + migrations (agent_tasks, agent_logs, gate_approvals)
- [x] Dashboard page (/admin/orchestration)
- [x] Agent tasks table component (desktop + mobile)
- [x] Task review drawer component
- [x] Tailwind + PostCSS config
- [x] Root layout and globals
- [x] README documentation

## 🔄 Next Steps (Manual)

1. **Initialize Git**
   ```bash
   cd robocogs-control-plane
   git init
   git add .
   git commit -m "initial: orchestration control-plane scaffold"
   ```

2. **Create GitHub Repository**
   ```bash
   gh repo create robocogs-control-plane --public --source=. --remote=origin --push
   ```

3. **Register GitHub App**
   - Go to https://github.com/settings/apps/new
   - Webhook URL: `https://[control-plane-url]/api/webhooks/github`
   - Webhook secret: Generate one, save to `GITHUB_WEBHOOK_SECRET`
   - App ID → `GITHUB_APP_ID`
   - Download private key → `GITHUB_APP_PRIVATE_KEY`

4. **Create Turso Database**
   ```bash
   turso db create robocogs-orchestration
   turso db tokens create robocogs-orchestration
   ```

5. **Set Environment Variables**
   ```bash
   cp .env.example .env.local
   # Fill in all vars from GitHub App, Turso, and Inngest
   ```

6. **Run Migrations**
   ```bash
   turso db shell robocogs-orchestration < db/migrations/001_initial.sql
   ```

7. **Install Dependencies & Dev Run**
   ```bash
   npm install
   npm run dev
   # Visit http://localhost:3001/admin/orchestration
   ```

8. **Wire GitHub Webhooks in robocogs repo**
   - robocogs Settings → Webhooks → Add webhook
   - Payload URL: `https://[control-plane-url]/api/webhooks/github`
   - Events: check_suite, pull_request, issue_comment
   - Secret: Same as `GITHUB_WEBHOOK_SECRET`

9. **Deploy to GCP Cloud Run**
   ```bash
   gcloud run deploy robocogs-control-plane \
     --source . \
     --set-env-vars TURSO_URL=...,TURSO_AUTH_TOKEN=...,GITHUB_APP_ID=...,etc
   ```

## 📚 Documentation

All cross-repo integration docs live in robocogs repo:
- `docs/ORCHESTRATION_V1_WEBHOOK_SECURITY_SPEC.md` — Webhook signing contract
- `docs/ORCHESTRATION_V1_EVENT_SCHEMAS.json` — Event definitions
- `docs/ORCHESTRATION_V1_CROSS_REPO_IMPLEMENTATION_CHECKLIST.md` — Phased rollout
