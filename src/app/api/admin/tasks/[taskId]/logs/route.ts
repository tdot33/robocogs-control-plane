import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ADMIN_SESSION_COOKIE, isAdminSessionValid } from '@/lib/admin-auth'
import { getLatestGateApproval, getTaskById, getTaskLogs } from '@/lib/db'
import {
  buildAuditorReviewPackage,
  buildImplementationPackage,
  buildPromotionPackage,
  parseImplementationEvidenceLog,
  parseAuditorReviewPackageLog,
  buildPlanPackage,
  type AuditorReviewPackage,
  type ImplementationEvidence,
  parseImplementationPackageLog,
  parsePlanPackageLog,
  parsePromotionPackageLog,
  type PromotionPackage,
} from '@/lib/plan-package'

interface LogPayload {
  message: string
  created_at: string
}

function filterSupersededLogs(logs: LogPayload[]) {
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

function extractImplementationEvidence(logs: LogPayload[]): ImplementationEvidence | null {
  for (const log of logs) {
    const implementationEvidence = parseImplementationEvidenceLog(log.message)
    if (implementationEvidence) {
      return implementationEvidence
    }
  }

  return null
}

function extractAuditorReviewPackage(logs: LogPayload[]): AuditorReviewPackage | null {
  for (const log of logs) {
    const auditorReviewPackage = parseAuditorReviewPackageLog(log.message)
    if (auditorReviewPackage) {
      return auditorReviewPackage
    }
  }

  return null
}

function extractPromotionPackage(logs: LogPayload[]): PromotionPackage | null {
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

  let answers: Record<string, string> = {}
  let note = ''
  try {
    const parsed = JSON.parse(intakeApproval.answers) as Record<string, string>
    answers = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value ?? '')]))
    note = String(parsed.note || '')
  } catch {
    answers = {}
  }

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

  let answers: Record<string, string> = {}
  let note = ''
  try {
    const parsed = JSON.parse(planApproval.answers) as Record<string, string>
    answers = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value ?? '')]))
    note = String(parsed.note || '')
  } catch {
    answers = {}
  }

  return buildImplementationPackage({ task, answers, note })
}

async function loadAuditorReviewPackage(taskId: string, logs: LogPayload[]) {
  const loggedAuditorReviewPackage = extractAuditorReviewPackage(logs)
  if (loggedAuditorReviewPackage) {
    return loggedAuditorReviewPackage
  }

  const task = await getTaskById(taskId)
  if (!task || !task.gate_current || !['implementation', 'merge-approval', 'promotion-approval', 'done'].includes(task.gate_current)) {
    return null
  }

  const implementationEvidence = extractImplementationEvidence(logs)
  if (!implementationEvidence) {
    return null
  }

  return buildAuditorReviewPackage({ task, implementationEvidence })
}

async function loadPromotionPackage(taskId: string, logs: LogPayload[]) {
  const loggedPromotionPackage = extractPromotionPackage(logs)
  if (loggedPromotionPackage) {
    return loggedPromotionPackage
  }

  const task = await getTaskById(taskId)
  if (!task || task.gate_current !== 'promotion-approval' || !task.branch?.startsWith('promotion:')) {
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

export async function GET(_request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(ADMIN_SESSION_COOKIE)?.value

  if (!isAdminSessionValid(sessionCookie)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { taskId } = await context.params
  if (!taskId) {
    return NextResponse.json({ error: 'Missing taskId' }, { status: 400 })
  }

  const logs = await getTaskLogs(taskId)
  const filteredLogs = filterSupersededLogs(logs as LogPayload[]).filter(
    (log) =>
      !parsePlanPackageLog(log.message) &&
      !parseImplementationPackageLog(log.message) &&
      !parseImplementationEvidenceLog(log.message) &&
      !parseAuditorReviewPackageLog(log.message) &&
      !parsePromotionPackageLog(log.message)
  )
  return NextResponse.json({
    logs: filteredLogs,
    planPackage: await loadPlanPackage(taskId, logs as LogPayload[]),
    implementationPackage: await loadImplementationPackage(taskId, logs as LogPayload[]),
    implementationEvidence: extractImplementationEvidence(logs as LogPayload[]),
    auditorReviewPackage: await loadAuditorReviewPackage(taskId, logs as LogPayload[]),
    promotionPackage: await loadPromotionPackage(taskId, logs as LogPayload[]),
  })
}