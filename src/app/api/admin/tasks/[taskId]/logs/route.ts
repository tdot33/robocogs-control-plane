import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ADMIN_SESSION_COOKIE, isAdminSessionValid } from '@/lib/admin-auth'
import { getTaskLogs } from '@/lib/db'
import { loadTaskPrContextByTaskId, stripStructuredPackageLogs } from '@/lib/task-pr-context'

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
  const taskContext = await loadTaskPrContextByTaskId(taskId)
  return NextResponse.json({
    logs: stripStructuredPackageLogs(logs as { message: string; created_at: string }[]),
    planPackage: taskContext?.kind === 'implementation' ? taskContext.planPackage : null,
    implementationPackage: taskContext?.kind === 'implementation' ? taskContext.implementationPackage : null,
    implementationEvidence: taskContext?.kind === 'implementation' ? taskContext.implementationEvidence : null,
    auditorReviewPackage: taskContext?.kind === 'implementation' ? taskContext.auditorReviewPackage : null,
    promotionPackage: taskContext?.kind === 'promotion' ? taskContext.promotionPackage : null,
  })
}