import assert from 'node:assert/strict'
import test from 'node:test'

import type { AgentTask } from '../src/lib/db'
import { getGateTimelineState } from '../src/lib/gates'
import { validateTaskIssueBranchPair } from '../src/lib/traceability'
import {
  buildMergeApprovalContext,
  getMergeApprovalReadiness,
  parseMergeApprovalContextLog,
  serializeMergeApprovalContextLog,
} from '../src/lib/merge-approval'
import {
  buildAuditorReviewPackage,
  buildImplementationEvidence,
  buildPlanPackage,
  buildPromotionPackage,
  parseAuditorReviewPackageLog,
  parseImplementationEvidenceLog,
  parsePlanPackageLog,
  parsePromotionPackageLog,
  serializeAuditorReviewPackageLog,
  serializeImplementationEvidenceLog,
  serializePlanPackageLog,
  serializePromotionPackageLog,
} from '../src/lib/plan-package'
import { buildTaskPrContextPayload, filterSupersededLogs, stripStructuredPackageLogs } from '../src/lib/task-pr-context'

function createTask(overrides: Partial<AgentTask> = {}): AgentTask {
  return {
    id: 'issue-346',
    task_name: 'Test orchestration task',
    assigned_agent: 'implementer',
    status: 'running',
    progress: 60,
    branch: 'feature/346-test-task',
    issue_number: 346,
    scope_slice: 'workflow-and-api',
    gate_current: 'implementation',
    created_at: '2026-04-04T12:00:00.000Z',
    updated_at: '2026-04-04T12:00:00.000Z',
    ...overrides,
  }
}

test('orchestration packages round-trip through log serialization', () => {
  const task = createTask()
  const planPackage = buildPlanPackage({
    task,
    answers: {
      'scope-clear': 'yes',
      'risk-assessed': 'yes',
    },
    note: 'Founder approved intake scope.',
  })
  const implementationEvidence = buildImplementationEvidence({
    taskId: task.id,
    branch: task.branch,
    prUrl: 'https://github.com/tdot33/robocogs/pull/346',
    headSha: 'abc123def456',
    validationSummary: 'npm run build passed',
    scopeSummary: 'Implemented only the approved orchestration changes.',
    rollbackNotes: 'Revert the feature branch PR if promotion fails.',
  })
  const auditorReviewPackage = buildAuditorReviewPackage({
    task,
    implementationEvidence,
  })
  const promotionPackage = buildPromotionPackage({
    task,
    prNumber: 360,
    baseBranch: 'master',
    headBranch: 'chet-dev',
    htmlUrl: 'https://github.com/tdot33/robocogs/pull/360',
  })

  assert.deepEqual(parsePlanPackageLog(serializePlanPackageLog(planPackage)), planPackage)
  assert.deepEqual(
    parseImplementationEvidenceLog(serializeImplementationEvidenceLog(implementationEvidence)),
    implementationEvidence,
  )
  assert.deepEqual(
    parseAuditorReviewPackageLog(serializeAuditorReviewPackageLog(auditorReviewPackage)),
    auditorReviewPackage,
  )
  assert.deepEqual(
    parsePromotionPackageLog(serializePromotionPackageLog(promotionPackage)),
    promotionPackage,
  )
})

test('merge approval readiness requires both CI context and implementation evidence', () => {
  const task = createTask()
  const ciContext = buildMergeApprovalContext({
    taskId: task.id,
    repoOwner: 'tdot33',
    repoName: 'robocogs',
    installationId: 123,
    prNumber: task.issue_number,
    headSha: 'abc123def456',
    workflowName: 'CI',
    htmlUrl: 'https://github.com/tdot33/robocogs/actions/runs/1',
  })
  const evidenceLog = serializeImplementationEvidenceLog(
    buildImplementationEvidence({
      taskId: task.id,
      branch: task.branch,
      headSha: 'abc123def456',
      validationSummary: 'npm run build passed',
      scopeSummary: 'Scope matched approved package.',
      rollbackNotes: 'Revert the branch PR.',
    }),
  )

  assert.equal(getMergeApprovalReadiness({ task, logs: [] }).state, 'waiting-for-ci-and-evidence')
  assert.equal(getMergeApprovalReadiness({ task, logs: [{ message: evidenceLog }] }).state, 'waiting-for-ci')
  assert.equal(
    getMergeApprovalReadiness({ task, logs: [{ message: serializeMergeApprovalContextLog(ciContext) }] }).state,
    'waiting-for-evidence',
  )

  const mismatchedReadiness = getMergeApprovalReadiness({
    task,
    logs: [{ message: serializeMergeApprovalContextLog(ciContext) }, {
      message: serializeImplementationEvidenceLog(
        buildImplementationEvidence({
          taskId: task.id,
          branch: task.branch,
          headSha: 'fff999eee888',
          validationSummary: 'npm run build passed',
          scopeSummary: 'Scope matched approved package.',
          rollbackNotes: 'Revert the branch PR.',
        }),
      ),
    }],
  })

  assert.equal(mismatchedReadiness.state, 'waiting-for-current-sha')

  const readiness = getMergeApprovalReadiness({
    task,
    logs: [{ message: serializeMergeApprovalContextLog(ciContext) }, { message: evidenceLog }],
  })

  assert.equal(readiness.state, 'ready')
  assert.equal(readiness.ciContext.repoName, 'robocogs')
  assert.deepEqual(parseMergeApprovalContextLog(serializeMergeApprovalContextLog(ciContext)), ciContext)
})

test('gate timeline includes promotion approval as the final explicit gate', () => {
  const timeline = getGateTimelineState('promotion-approval', 'awaiting_approval')

  assert.equal(timeline['intake'], 'complete')
  assert.equal(timeline['plan-approval'], 'complete')
  assert.equal(timeline['implementation'], 'complete')
  assert.equal(timeline['merge-approval'], 'complete')
  assert.equal(timeline['promotion-approval'], 'active')
})

test('plan-approval traceability validation rejects mismatched issue and branch pairs', () => {
  const valid = validateTaskIssueBranchPair('fix/364-correct-ci-push-base-resolution', 364)
  const mismatch = validateTaskIssueBranchPair('fix/364-correct-ci-push-base-resolution', 365)

  assert.equal(valid.status, 'valid')
  assert.equal(mismatch.status, 'mismatch')
  assert.match(mismatch.message, /issue #364/)
})

test('task PR context payload uses implementation shape for issue-scoped tasks', () => {
  const task = createTask()
  const planPackage = buildPlanPackage({
    task,
    answers: {
      'scope-clear': 'yes',
      'risk-assessed': 'yes',
    },
  })
  const implementationEvidence = buildImplementationEvidence({
    taskId: task.id,
    branch: task.branch,
    prUrl: 'https://github.com/tdot33/robocogs/pull/431',
    headSha: 'abc123def456',
    validationSummary: 'npm run test:traceability passed',
    scopeSummary: 'Only PR context automation paths changed.',
    rollbackNotes: 'Revert the PR helper changes if rollout fails.',
  })
  const auditorReviewPackage = buildAuditorReviewPackage({ task, implementationEvidence })

  const payload = buildTaskPrContextPayload({
    task,
    planPackage,
    implementationPackage: null,
    implementationEvidence,
    auditorReviewPackage,
    promotionPackage: null,
  })

  assert.equal(payload.kind, 'implementation')
  assert.equal(payload.taskId, task.id)
  assert.equal(payload.planPackage?.taskId, task.id)
  assert.equal(payload.implementationEvidence?.validationSummary, 'npm run test:traceability passed')
})

test('task PR context payload uses promotion shape for promotion tasks', () => {
  const task = createTask({
    id: 'promotion-430',
    task_name: 'Promote chet-dev to master',
    branch: 'promotion:chet-dev->master#430',
    issue_number: null,
    gate_current: 'promotion-approval',
  })
  const promotionPackage = buildPromotionPackage({
    task,
    prNumber: 430,
    headBranch: 'chet-dev',
    baseBranch: 'master',
    htmlUrl: 'https://github.com/tdot33/robocogs/pull/430',
  })

  const payload = buildTaskPrContextPayload({
    task,
    planPackage: null,
    implementationPackage: null,
    implementationEvidence: null,
    auditorReviewPackage: null,
    promotionPackage,
  })

  assert.equal(payload.kind, 'promotion')
  assert.equal(payload.promotionPackage?.summary.includes('Founder approval is required'), true)
})

test('structured task context helpers filter superseded intake errors and package logs', () => {
  const logs = [
    { message: 'Failed to post intake gate comment: timeout', created_at: '2026-04-06T10:00:00.000Z' },
    { message: 'Posted intake gate comment: https://github.com/example/comment/1', created_at: '2026-04-06T10:05:00.000Z' },
    { message: 'Failed to post intake gate comment: later failure', created_at: '2026-04-06T10:10:00.000Z' },
    { message: serializePlanPackageLog(buildPlanPackage({ task: createTask(), answers: {} })), created_at: '2026-04-06T10:11:00.000Z' },
    { message: 'Human readable audit note', created_at: '2026-04-06T10:12:00.000Z' },
  ]

  const filtered = filterSupersededLogs(logs)
  assert.equal(filtered.some((log) => log.message.includes('timeout')), false)
  assert.equal(filtered.some((log) => log.message.includes('later failure')), true)

  const stripped = stripStructuredPackageLogs(logs)
  assert.equal(stripped.some((log) => log.message.startsWith('[plan-package]')), false)
  assert.equal(stripped.some((log) => log.message === 'Human readable audit note'), true)
})