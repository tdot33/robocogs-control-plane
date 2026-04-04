import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ADMIN_SESSION_COOKIE, isAdminSessionValid } from '@/lib/admin-auth'
import { getTaskLogs } from '@/lib/db'
import { parsePlanPackageLog } from '@/lib/plan-package'

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
  const filteredLogs = filterSupersededLogs(logs as LogPayload[]).filter((log) => !parsePlanPackageLog(log.message))
  return NextResponse.json({
    logs: filteredLogs,
    planPackage: extractPlanPackage(logs as LogPayload[]),
  })
}