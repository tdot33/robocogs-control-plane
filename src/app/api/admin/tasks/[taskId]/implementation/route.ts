import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ADMIN_SESSION_COOKIE, isAdminSessionValid } from '@/lib/admin-auth'
import { appendLog, getTaskById, updateTaskStatus } from '@/lib/db'
import { buildImplementationEvidence, serializeImplementationEvidenceLog } from '@/lib/plan-package'

interface ImplementationEvidenceBody {
  prUrl?: string
  headSha?: string
  validationSummary?: string
  scopeSummary?: string
  rollbackNotes?: string
}

export async function POST(request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(ADMIN_SESSION_COOKIE)?.value

  if (!isAdminSessionValid(sessionCookie)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { taskId } = await context.params
  if (!taskId) {
    return NextResponse.json({ error: 'Missing taskId' }, { status: 400 })
  }

  const task = await getTaskById(taskId)
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  if (task.gate_current !== 'implementation') {
    return NextResponse.json({ error: 'Implementation evidence can only be submitted during the implementation gate' }, { status: 409 })
  }

  const body = (await request.json().catch(() => ({}))) as ImplementationEvidenceBody
  const evidence = buildImplementationEvidence({
    taskId,
    branch: task.branch,
    prUrl: body.prUrl,
    headSha: String(body.headSha || ''),
    validationSummary: String(body.validationSummary || ''),
    scopeSummary: String(body.scopeSummary || ''),
    rollbackNotes: String(body.rollbackNotes || ''),
  })

  if (!evidence.headSha || !evidence.validationSummary || !evidence.scopeSummary || !evidence.rollbackNotes) {
    return NextResponse.json(
      { error: 'Head SHA, validation summary, scope summary, and rollback notes are required' },
      { status: 400 }
    )
  }

  await appendLog(taskId, 'implementer', 'Submitted implementation evidence package')
  await appendLog(taskId, 'implementer', serializeImplementationEvidenceLog(evidence), 'debug')
  await updateTaskStatus(taskId, 'running', Math.max(task.progress, 65))

  return NextResponse.json({ ok: true, taskId, evidence })
}