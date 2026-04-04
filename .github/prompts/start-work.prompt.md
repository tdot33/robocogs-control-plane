---
agent: ask
description: Start issue-first work by creating/linking a GitHub issue and creating a short-lived branch with npm work:start.
---

Start issue-first workflow for this request.

1. Classify work type as one of: `feature`, `fix`, `hotfix`, `chore`, `docs`.
2. Produce a concise work title from the user goal.
3. If type is `feature`, `fix`, or `hotfix`, run:

```bash
npm run work:start -- --type=<type> --title="<title>"
```

4. If type is `chore` or `docs`, run either:

```bash
npm run work:start -- --type=<type> --title="<title>" --no-issue
```

5. Report created/linked issue number and branch name.
6. Defer any follow-on PR or promotion workflow to the active repository instructions.