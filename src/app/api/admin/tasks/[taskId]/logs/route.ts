import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ADMIN_SESSION_COOKIE, isAdminSessionValid } from '@/lib/admin-auth'
import { getLatestGateApproval, getTaskById, getTaskLogs } from '@/lib/db'
import {
  buildImplementationPackage,
  buildPlanPackage,
  parseImplementationPackageLog,
  parsePlanPackageLog,
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
    (log) => !parsePlanPackageLog(log.message) && !parseImplementationPackageLog(log.message)
  )
  return NextResponse.json({
    logs: filteredLogs,
    planPackage: await loadPlanPackage(taskId, logs as LogPayload[]),
    implementationPackage: await loadImplementationPackage(taskId, logs as LogPayload[]),
  })
}