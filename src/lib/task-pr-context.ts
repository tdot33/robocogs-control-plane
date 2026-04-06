import {
  getLatestGateApproval,
  getTaskByBranch,
  getTaskById,
  getTaskByIssueNumber,
  getTaskLogs,
  type AgentTask,
  type AgentLog,
} from './db'
import {
  buildAuditorReviewPackage,
  buildImplementationPackage,
  buildPlanPackage,
  buildPromotionPackage,
  parseAuditorReviewPackageLog,
  parseImplementationEvidenceLog,
  parseImplementationPackageLog,
  parsePlanPackageLog,
  parsePromotionPackageLog,
  type AuditorReviewPackage,
  type ImplementationEvidence,
  type ImplementationPackage,
  type PlanPackage,
  type PromotionPackage,
} from './plan-package'

interface LogPayload {
  message: string
  created_at: string
}

export interface ImplementationPrContextPayload {
  kind: 'implementation'
  taskId: string
  taskName: string
  branch: string | null
  issueNumber: number | null
  gateCurrent: string | null
  planPackage: PlanPackage | null
  implementationPackage: ImplementationPackage | null
  implementationEvidence: ImplementationEvidence | null
  auditorReviewPackage: AuditorReviewPackage | null
}

export interface PromotionPrContextPayload {
  kind: 'promotion'
  taskId: string
  taskName: string
  branch: string | null
  issueNumber: number | null
  gateCurrent: string | null
  promotionPackage: PromotionPackage | null
}

export type TaskPrContextPayload = ImplementationPrContextPayload | PromotionPrContextPayload

function parseApprovalAnswers(rawAnswers: string) {
  try {
    const parsed = JSON.parse(rawAnswers) as Record<string, string>
    const answers = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value ?? '')]))
    return {
      answers,
      note: String(parsed.note || ''),
    }
  } catch {
    return {
      answers: {} as Record<string, string>,
      note: '',
    }
  }
}

export function filterSupersededLogs(logs: LogPayload[]) {
  const latestIntakeCommentSuccess = logs
    .filter((log) => log.message.startsWith('Posted intake gate comment:'))
    .map((log) => Date.parse(log.created_at))
    .filter((timestamp) => Number.isFinite(timestamp))
    .sort((left, right) => right - left)[0]

  if (!latestIntakeCommentSuccess) {
    return logs
  }

  return logs.filter((log) => {
    if (!log.message.startsWith('Failed to post intake gate comment:')) {
      return true
    }

    const createdAt = Date.parse(log.created_at)
    return !Number.isFinite(createdAt) || createdAt > latestIntakeCommentSuccess
  })
}

export function stripStructuredPackageLogs(logs: LogPayload[]) {
  return filterSupersededLogs(logs).filter(
    (log) =>
      !parsePlanPackageLog(log.message) &&
      !parseImplementationPackageLog(log.message) &&
      !parseImplementationEvidenceLog(log.message) &&
      !parseAuditorReviewPackageLog(log.message) &&
      !parsePromotionPackageLog(log.message)
  )
}

function extractPlanPackage(logs: LogPayload[]) {
  for (const log of logs) {
    const planPackage = parsePlanPackageLog(log.message)
    if (planPackage) {
      return planPackage
    }
  }

  return null
}

function extractImplementationPackage(logs: LogPayload[]) {
  for (const log of logs) {
    const implementationPackage = parseImplementationPackageLog(log.message)
    if (implementationPackage) {
      return implementationPackage
    }
  }

  return null
}

function extractImplementationEvidence(logs: LogPayload[]) {
  for (const log of logs) {
    const implementationEvidence = parseImplementationEvidenceLog(log.message)
    if (implementationEvidence) {
      return implementationEvidence
    }
  }

  return null
}

function extractAuditorReviewPackage(logs: LogPayload[]) {
  for (const log of logs) {
    const auditorReviewPackage = parseAuditorReviewPackageLog(log.message)
    if (auditorReviewPackage) {
      return auditorReviewPackage
    }
  }

  return null
}

function extractPromotionPackage(logs: LogPayload[]) {
  for (const log of logs) {
    const promotionPackage = parsePromotionPackageLog(log.message)
    if (promotionPackage) {
      return promotionPackage
    }
  }

  return null
}

async function loadPlanPackage(taskId: string, logs: LogPayload[]) {
  const loggedPlanPackage = extractPlanPackage(logs)
  if (loggedPlanPackage) {
    return loggedPlanPackage
  }

  const task = await getTaskById(taskId)
  if (!task || !task.gate_current || !['plan-approval', 'implementation', 'merge-approval', 'promotion-approval', 'done'].includes(task.gate_current)) {
    return null
  }

  const intakeApproval = await getLatestGateApproval(taskId, 'intake')
  if (!intakeApproval) {
    return null
  }

  const { answers, note } = parseApprovalAnswers(intakeApproval.answers)
  return buildPlanPackage({ task, answers, note })
}

async function loadImplementationPackage(taskId: string, logs: LogPayload[]) {
  const loggedImplementationPackage = extractImplementationPackage(logs)
  if (loggedImplementationPackage) {
    return loggedImplementationPackage
  }

  const task = await getTaskById(taskId)
  if (!task || !task.gate_current || !['implementation', 'merge-approval', 'promotion-approval', 'done'].includes(task.gate_current)) {
    return null
  }

  const planApproval = await getLatestGateApproval(taskId, 'plan-approval')
  if (!planApproval) {
    return null
  }

  const { answers, note } = parseApprovalAnswers(planApproval.answers)
  return buildImplementationPackage({ task, answers, note })
}

async function loadAuditorReviewPackage(task: AgentTask, logs: LogPayload[]) {
  const loggedAuditorReviewPackage = extractAuditorReviewPackage(logs)
  if (loggedAuditorReviewPackage) {
    return loggedAuditorReviewPackage
  }

  if (!task.gate_current || !['implementation', 'merge-approval', 'promotion-approval', 'done'].includes(task.gate_current)) {
    return null
  }

  const implementationEvidence = extractImplementationEvidence(logs)
  if (!implementationEvidence) {
    return null
  }

  return buildAuditorReviewPackage({ task, implementationEvidence })
}

async function loadPromotionPackage(task: AgentTask, logs: LogPayload[]) {
  const loggedPromotionPackage = extractPromotionPackage(logs)
  if (loggedPromotionPackage) {
    return loggedPromotionPackage
  }

  if (task.gate_current !== 'promotion-approval' || !task.branch?.startsWith('promotion:')) {
    return null
  }

  const match = task.branch.match(/^promotion:(.+)->(.+)#(\d+)$/)
  if (!match) {
    return null
  }

  return buildPromotionPackage({
    task,
    headBranch: match[1],
    baseBranch: match[2],
    prNumber: Number(match[3]),
    htmlUrl: 'Promotion PR URL recorded in activity logs.',
  })
}

export function buildTaskPrContextPayload(input: {
  task: AgentTask
  planPackage: PlanPackage | null
  implementationPackage: ImplementationPackage | null
  implementationEvidence: ImplementationEvidence | null
  auditorReviewPackage: AuditorReviewPackage | null
  promotionPackage: PromotionPackage | null
}): TaskPrContextPayload {
  const base = {
    taskId: input.task.id,
    taskName: input.task.task_name,
    branch: input.task.branch,
    issueNumber: input.task.issue_number,
    gateCurrent: input.task.gate_current,
  }

  if (input.task.branch?.startsWith('promotion:')) {
    return {
      kind: 'promotion',
      ...base,
      promotionPackage: input.promotionPackage,
    }
  }

  return {
    kind: 'implementation',
    ...base,
    planPackage: input.planPackage,
    implementationPackage: input.implementationPackage,
    implementationEvidence: input.implementationEvidence,
    auditorReviewPackage: input.auditorReviewPackage,
  }
}

export async function loadTaskPrContextByTaskId(taskId: string): Promise<TaskPrContextPayload | null> {
  const task = await getTaskById(taskId)
  if (!task) {
    return null
  }

  const logs = (await getTaskLogs(taskId)) as AgentLog[]
  const payloadLogs = logs as LogPayload[]

  return buildTaskPrContextPayload({
    task,
    planPackage: await loadPlanPackage(taskId, payloadLogs),
    implementationPackage: await loadImplementationPackage(taskId, payloadLogs),
    implementationEvidence: extractImplementationEvidence(payloadLogs),
    auditorReviewPackage: await loadAuditorReviewPackage(task, payloadLogs),
    promotionPackage: await loadPromotionPackage(task, payloadLogs),
  })
}

export async function loadTaskPrContext(input: {
  taskId?: string
  issueNumber?: number
  branchName?: string
  prNumber?: number
  headBranch?: string
  baseBranch?: string
}): Promise<TaskPrContextPayload | null> {
  let task: AgentTask | null = null

  if (input.taskId) {
    task = await getTaskById(input.taskId)
  }

  if (!task && input.issueNumber) {
    task = await getTaskByIssueNumber(input.issueNumber)
  }

  if (!task && input.branchName) {
    task = await getTaskByBranch(input.branchName)
  }

  if (!task && input.prNumber && input.headBranch && input.baseBranch) {
    task = await getTaskByBranch(`promotion:${input.headBranch}->${input.baseBranch}#${input.prNumber}`)
  }

  if (!task) {
    return null
  }

  return loadTaskPrContextByTaskId(task.id)
}