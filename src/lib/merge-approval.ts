import type { AgentTask } from './db'
import { parseImplementationEvidenceLog } from './plan-package'

export interface MergeApprovalContext {
  version: number
  recordedAt: string
  taskId: string
  repoOwner: string
  repoName: string
  installationId: number
  prNumber: number | null
  headSha: string
  workflowName: string
  htmlUrl: string
}

export const MERGE_APPROVAL_CONTEXT_LOG_PREFIX = '[merge-approval-context] '

export function buildMergeApprovalContext(input: {
  taskId: string
  repoOwner: string
  repoName: string
  installationId: number
  prNumber?: number | null
  headSha: string
  workflowName: string
  htmlUrl: string
}): MergeApprovalContext {
  return {
    version: 1,
    recordedAt: new Date().toISOString(),
    taskId: input.taskId,
    repoOwner: input.repoOwner,
    repoName: input.repoName,
    installationId: input.installationId,
    prNumber: input.prNumber ?? null,
    headSha: input.headSha,
    workflowName: input.workflowName,
    htmlUrl: input.htmlUrl,
  }
}

export function serializeMergeApprovalContextLog(context: MergeApprovalContext): string {
  return `${MERGE_APPROVAL_CONTEXT_LOG_PREFIX}${JSON.stringify(context)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback
}

export function parseMergeApprovalContextLog(message: string): MergeApprovalContext | null {
  if (!message.startsWith(MERGE_APPROVAL_CONTEXT_LOG_PREFIX)) {
    return null
  }

  try {
    const parsed = JSON.parse(message.slice(MERGE_APPROVAL_CONTEXT_LOG_PREFIX.length))
    if (!isRecord(parsed)) {
      return null
    }

    return {
      version: asNumber(parsed.version, 1),
      recordedAt: asString(parsed.recordedAt),
      taskId: asString(parsed.taskId),
      repoOwner: asString(parsed.repoOwner),
      repoName: asString(parsed.repoName),
      installationId: asNumber(parsed.installationId),
      prNumber: typeof parsed.prNumber === 'number' ? parsed.prNumber : null,
      headSha: asString(parsed.headSha),
      workflowName: asString(parsed.workflowName),
      htmlUrl: asString(parsed.htmlUrl),
    }
  } catch {
    return null
  }
}

export function findLatestMergeApprovalContext(logs: Array<{ message: string }>): MergeApprovalContext | null {
  for (const log of logs) {
    const context = parseMergeApprovalContextLog(log.message)
    if (context) {
      return context
    }
  }

  return null
}

export function hasImplementationEvidence(logs: Array<{ message: string }>): boolean {
  return logs.some((log) => Boolean(parseImplementationEvidenceLog(log.message)))
}

export function getMergeApprovalReadiness(input: {
  task: AgentTask
  logs: Array<{ message: string }>
  ciContext?: MergeApprovalContext | null
}) {
  const { task, logs } = input

  if (task.status === 'complete' || task.gate_current === 'done') {
    return { state: 'complete' as const }
  }

  if (task.gate_current === 'merge-approval') {
    return { state: 'already-queued' as const }
  }

  if (task.gate_current !== 'implementation') {
    return { state: 'not-in-implementation' as const }
  }

  const ciContext = input.ciContext ?? findLatestMergeApprovalContext(logs)
  const implementationEvidencePresent = hasImplementationEvidence(logs)

  if (!ciContext && !implementationEvidencePresent) {
    return { state: 'waiting-for-ci-and-evidence' as const }
  }

  if (!ciContext) {
    return { state: 'waiting-for-ci' as const }
  }

  if (!implementationEvidencePresent) {
    return { state: 'waiting-for-evidence' as const }
  }

  return {
    state: 'ready' as const,
    ciContext,
  }
}