import type { AgentTask } from './db'

export interface PlanPackage {
  version: number
  generatedAt: string
  taskId: string
  sourceGate: string
  summary: string
  objectives: string[]
  executionPolicy: string[]
  implementationSteps: string[]
  validationSteps: string[]
  rollbackSteps: string[]
  riskNotes: string[]
}

export const PLAN_PACKAGE_LOG_PREFIX = '[plan-package] '

export interface ImplementationPackage {
  version: number
  generatedAt: string
  taskId: string
  sourceGate: string
  summary: string
  executionPolicy: string[]
  implementationChecklist: string[]
  validationSteps: string[]
  mergePolicy: string[]
  riskNotes: string[]
}

export const IMPLEMENTATION_PACKAGE_LOG_PREFIX = '[implementation-package] '

export interface ImplementationEvidence {
  version: number
  submittedAt: string
  taskId: string
  gateName: 'implementation'
  branch: string
  prUrl: string
  headSha: string
  validationSummary: string
  scopeSummary: string
  rollbackNotes: string
}

export const IMPLEMENTATION_EVIDENCE_LOG_PREFIX = '[implementation-evidence] '

export interface AuditorReviewPackage {
  version: number
  generatedAt: string
  taskId: string
  sourceGate: 'implementation'
  summary: string
  evidenceChecklist: string[]
  reviewFocus: string[]
  mergeCriteria: string[]
  closeoutExpectations: string[]
}

export const AUDITOR_REVIEW_PACKAGE_LOG_PREFIX = '[auditor-review-package] '

export function buildPlanPackage(input: {
  task: AgentTask
  answers: Record<string, string>
  note?: string
}): PlanPackage {
  const { task, answers, note } = input
  const scopeConfirmed = answers['scope-clear'] === 'yes'
  const riskAccepted = answers['risk-assessed'] === 'yes'

  const branchContext = task.branch ? `Work on branch ${task.branch}.` : 'Work on the task branch created by work:start.'
  const issueContext = task.issue_number ? `Track implementation evidence against issue #${task.issue_number}.` : 'Track implementation evidence against the orchestration task.'
  const trackedBranchPolicy = task.branch
    ? `Apply changes on ${task.branch} and push updates to origin/${task.branch} before requesting merge review.`
    : 'Apply changes on the tracked work branch and push it before requesting merge review.'

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    taskId: task.id,
    sourceGate: 'intake',
    summary: `Implementation package for ${task.task_name}. ${branchContext}`,
    objectives: [
      `Implement the requested change for \"${task.task_name}\" with the smallest viable diff.`,
      issueContext,
      'Preserve existing production behavior outside the approved scope.',
    ],
    executionPolicy: [
      trackedBranchPolicy,
      'Do not retarget work onto master during implementation. Keep execution on the tracked work branch.',
      'Use the repository workflow helpers when needed: work:start establishes the branch, and work:pr opens or updates the review path.',
    ],
    implementationSteps: [
      'Inspect the target workflow and identify the root change required for the requested behavior.',
      'Apply the code change on the tracked branch using the repository workflow and branch policy.',
      'Update any directly impacted automation, validation, or documentation paths needed for a safe merge.',
    ],
    validationSteps: [
      'Run the narrowest relevant build, test, or lint validation for the changed area.',
      'Capture the validation outcome in task logs before requesting merge approval.',
      'Verify the resulting behavior matches the approved intake scope and does not expand beyond it.',
    ],
    rollbackSteps: [
      'Revert the implementation commit or PR if validation fails or scope expands unexpectedly.',
      'Restore the last known-good behavior and record the blocking reason in the orchestration task.',
    ],
    riskNotes: [
      scopeConfirmed ? 'Scope was explicitly confirmed during intake approval.' : 'Scope confirmation was not explicit; review the branch diff carefully before implementation.',
      riskAccepted ? 'Risk posture was accepted during intake approval.' : 'Risk posture was not fully accepted during intake approval; require extra validation before merge.',
      note ? `Intake note: ${note}` : 'No additional intake note was provided.',
    ],
  }
}

export function buildImplementationPackage(input: {
  task: AgentTask
  answers: Record<string, string>
  note?: string
}): ImplementationPackage {
  const { task, answers, note } = input
  const trackedBranch = task.branch || 'the tracked work branch'
  const planSound = answers['plan-sound'] === 'yes'
  const validationReady = answers['testability'] === 'yes'
  const rollbackReady = answers['rollback-ready'] === 'yes'

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    taskId: task.id,
    sourceGate: 'plan-approval',
    summary: `Implementation handoff for ${task.task_name}. Execute on ${trackedBranch} and keep merge flow off master until review is complete.`,
    executionPolicy: [
      `Make all code changes on ${trackedBranch}.`,
      task.branch
        ? `Push commits to origin/${task.branch} before requesting merge approval.`
        : 'Push the tracked work branch before requesting merge approval.',
      'Do not merge directly to master from agent work. Open or update the review branch/PR first, then follow the repository promotion path.',
    ],
    implementationChecklist: [
      'Execute only the approved scope from the plan package and avoid unrelated cleanup.',
      'Keep diffs surgical and aligned with existing repository patterns.',
      'Record validation evidence and any scope escalations in orchestration logs before requesting the next gate.',
    ],
    validationSteps: [
      validationReady
        ? 'Run the planned validation commands and capture pass/fail results in the task log.'
        : 'Define and run the minimum safe validation set before requesting merge approval.',
      'Re-check the final branch diff against the approved scope before handoff.',
    ],
    mergePolicy: [
      'Use work:pr or the equivalent repository PR flow from the tracked branch.',
      'Keep master merges behind the repository\'s normal review and promotion path.',
      'Request merge approval only after the work branch is pushed and validation evidence is attached.',
    ],
    riskNotes: [
      planSound ? 'Plan approval confirmed the proposed implementation shape.' : 'Plan soundness was not explicitly confirmed; validate change shape before coding.',
      rollbackReady ? 'Rollback strategy was confirmed at plan approval.' : 'Rollback strategy was not fully confirmed; document rollback details during implementation.',
      note ? `Plan approval note: ${note}` : 'No additional plan approval note was provided.',
    ],
  }
}

export function serializePlanPackageLog(planPackage: PlanPackage): string {
  return `${PLAN_PACKAGE_LOG_PREFIX}${JSON.stringify(planPackage)}`
}

export function serializeImplementationPackageLog(implementationPackage: ImplementationPackage): string {
  return `${IMPLEMENTATION_PACKAGE_LOG_PREFIX}${JSON.stringify(implementationPackage)}`
}

export function buildImplementationEvidence(input: {
  taskId: string
  branch: string | null
  prUrl?: string
  headSha: string
  validationSummary: string
  scopeSummary: string
  rollbackNotes: string
}): ImplementationEvidence {
  return {
    version: 1,
    submittedAt: new Date().toISOString(),
    taskId: input.taskId,
    gateName: 'implementation',
    branch: input.branch || '',
    prUrl: (input.prUrl || '').trim(),
    headSha: input.headSha.trim(),
    validationSummary: input.validationSummary.trim(),
    scopeSummary: input.scopeSummary.trim(),
    rollbackNotes: input.rollbackNotes.trim(),
  }
}

export function serializeImplementationEvidenceLog(implementationEvidence: ImplementationEvidence): string {
  return `${IMPLEMENTATION_EVIDENCE_LOG_PREFIX}${JSON.stringify(implementationEvidence)}`
}

export function buildAuditorReviewPackage(input: {
  task: AgentTask
  implementationEvidence: ImplementationEvidence
}): AuditorReviewPackage {
  const { task, implementationEvidence } = input
  const trackedBranch = implementationEvidence.branch || task.branch || 'the tracked work branch'

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    taskId: task.id,
    sourceGate: 'implementation',
    summary: `Auditor review package for ${task.task_name}. Review the evidence captured on ${trackedBranch} before merge approval is granted.`,
    evidenceChecklist: [
      implementationEvidence.prUrl
        ? `PR prepared for review: ${implementationEvidence.prUrl}`
        : 'PR URL was not supplied; confirm the review branch is available before merge approval.',
      `Head SHA submitted for review: ${implementationEvidence.headSha}.`,
      `Validation evidence captured: ${implementationEvidence.validationSummary}.`,
      `Implemented scope summary captured: ${implementationEvidence.scopeSummary}.`,
      `Rollback notes captured: ${implementationEvidence.rollbackNotes}.`,
    ],
    reviewFocus: [
      'Confirm the submitted scope matches the approved implementation package and excludes unrelated changes.',
      'Validate that the recorded evidence is sufficient for founder merge approval, not just local confidence.',
      'Check branch state, PR readiness, and CI outcomes before advancing the task to merge review.',
    ],
    mergeCriteria: [
      'Merge approval only opens after both CI success and implementation evidence are present.',
      'Evidence package must remain current with the reviewed head SHA and PR state.',
      'Escalate any scope or rollback gaps before founder merge approval is requested.',
    ],
    closeoutExpectations: [
      'Keep the audit trail explicit in task logs so historian closeout is based on recorded evidence rather than inference.',
      'Hand off to historian only after merge or final approval disposition is recorded.',
    ],
  }
}

export function serializeAuditorReviewPackageLog(auditorReviewPackage: AuditorReviewPackage): string {
  return `${AUDITOR_REVIEW_PACKAGE_LOG_PREFIX}${JSON.stringify(auditorReviewPackage)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 1): number {
  return typeof value === 'number' ? value : fallback
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function normalizePlanPackage(value: unknown): PlanPackage | null {
  if (!isRecord(value)) {
    return null
  }

  return {
    version: asNumber(value.version),
    generatedAt: asString(value.generatedAt),
    taskId: asString(value.taskId),
    sourceGate: asString(value.sourceGate),
    summary: asString(value.summary),
    objectives: asStringArray(value.objectives),
    executionPolicy: asStringArray(value.executionPolicy),
    implementationSteps: asStringArray(value.implementationSteps),
    validationSteps: asStringArray(value.validationSteps),
    rollbackSteps: asStringArray(value.rollbackSteps),
    riskNotes: asStringArray(value.riskNotes),
  }
}

function normalizeImplementationPackage(value: unknown): ImplementationPackage | null {
  if (!isRecord(value)) {
    return null
  }

  return {
    version: asNumber(value.version),
    generatedAt: asString(value.generatedAt),
    taskId: asString(value.taskId),
    sourceGate: asString(value.sourceGate),
    summary: asString(value.summary),
    executionPolicy: asStringArray(value.executionPolicy),
    implementationChecklist: asStringArray(value.implementationChecklist),
    validationSteps: asStringArray(value.validationSteps),
    mergePolicy: asStringArray(value.mergePolicy),
    riskNotes: asStringArray(value.riskNotes),
  }
}

function normalizeImplementationEvidence(value: unknown): ImplementationEvidence | null {
  if (!isRecord(value)) {
    return null
  }

  return {
    version: asNumber(value.version),
    submittedAt: asString(value.submittedAt),
    taskId: asString(value.taskId),
    gateName: 'implementation',
    branch: asString(value.branch),
    prUrl: asString(value.prUrl),
    headSha: asString(value.headSha),
    validationSummary: asString(value.validationSummary),
    scopeSummary: asString(value.scopeSummary),
    rollbackNotes: asString(value.rollbackNotes),
  }
}

function normalizeAuditorReviewPackage(value: unknown): AuditorReviewPackage | null {
  if (!isRecord(value)) {
    return null
  }

  return {
    version: asNumber(value.version),
    generatedAt: asString(value.generatedAt),
    taskId: asString(value.taskId),
    sourceGate: 'implementation',
    summary: asString(value.summary),
    evidenceChecklist: asStringArray(value.evidenceChecklist),
    reviewFocus: asStringArray(value.reviewFocus),
    mergeCriteria: asStringArray(value.mergeCriteria),
    closeoutExpectations: asStringArray(value.closeoutExpectations),
  }
}

export function parsePlanPackageLog(message: string): PlanPackage | null {
  if (!message.startsWith(PLAN_PACKAGE_LOG_PREFIX)) {
    return null
  }

  try {
    return normalizePlanPackage(JSON.parse(message.slice(PLAN_PACKAGE_LOG_PREFIX.length)))
  } catch {
    return null
  }
}

export function parseImplementationPackageLog(message: string): ImplementationPackage | null {
  if (!message.startsWith(IMPLEMENTATION_PACKAGE_LOG_PREFIX)) {
    return null
  }

  try {
    return normalizeImplementationPackage(JSON.parse(message.slice(IMPLEMENTATION_PACKAGE_LOG_PREFIX.length)))
  } catch {
    return null
  }
}

export function parseImplementationEvidenceLog(message: string): ImplementationEvidence | null {
  if (!message.startsWith(IMPLEMENTATION_EVIDENCE_LOG_PREFIX)) {
    return null
  }

  try {
    return normalizeImplementationEvidence(JSON.parse(message.slice(IMPLEMENTATION_EVIDENCE_LOG_PREFIX.length)))
  } catch {
    return null
  }
}

export function parseAuditorReviewPackageLog(message: string): AuditorReviewPackage | null {
  if (!message.startsWith(AUDITOR_REVIEW_PACKAGE_LOG_PREFIX)) {
    return null
  }

  try {
    return normalizeAuditorReviewPackage(JSON.parse(message.slice(AUDITOR_REVIEW_PACKAGE_LOG_PREFIX.length)))
  } catch {
    return null
  }
}