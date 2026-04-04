import type { AgentTask } from './db'

export interface PlanPackage {
  version: number
  generatedAt: string
  taskId: string
  sourceGate: string
  summary: string
  objectives: string[]
  implementationSteps: string[]
  validationSteps: string[]
  rollbackSteps: string[]
  riskNotes: string[]
}

export const PLAN_PACKAGE_LOG_PREFIX = '[plan-package] '

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
    implementationSteps: [
      'Inspect the target workflow and identify the root change required for the requested behavior.',
      'Apply the code change on the tracked branch using the repository workflow and traceability rules.',
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

export function serializePlanPackageLog(planPackage: PlanPackage): string {
  return `${PLAN_PACKAGE_LOG_PREFIX}${JSON.stringify(planPackage)}`
}

export function parsePlanPackageLog(message: string): PlanPackage | null {
  if (!message.startsWith(PLAN_PACKAGE_LOG_PREFIX)) {
    return null
  }

  try {
    return JSON.parse(message.slice(PLAN_PACKAGE_LOG_PREFIX.length)) as PlanPackage
  } catch {
    return null
  }
}