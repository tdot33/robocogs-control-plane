---
agent: ask
description: Run the adaptive, click-first orchestration gate flow for founder approvals.
---

Run the RoboCOGS adaptive gate flow using the question packs under `.github/orchestration/question-packs/`.

Execution order:

1. intake
2. plan-approval
3. scope-lock
4. audit-disposition
5. merge-approval
6. promotion-approval

Routing and confidence policy:

- Confidence >= 0.80: continue to next gate.
- Confidence 0.60-0.79: ask one contextual branch pack question before continuing.
- Confidence < 0.60: run clarification mini-pack, then continue.

Hard-block policy:

- Never proceed past a gate when its `hardBlock` condition is unmet.
- For plan approval, require explicit approval before implementation starts.
- For audit disposition, keep merge closed if blocking findings exist.
- For promotion approval, block promotion unless all pass/acceptable/confirmed answers are selected.

Founder interaction style:

- Prefer fixed options; avoid open-ended prompts unless a revise/hold choice is selected.
- Keep prompts concise and action-oriented.