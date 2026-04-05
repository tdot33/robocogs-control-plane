import assert from 'node:assert/strict'
import test from 'node:test'

import type { AgentTask } from '../src/lib/db'
import { getGateTimelineState } from '../src/lib/gates'
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