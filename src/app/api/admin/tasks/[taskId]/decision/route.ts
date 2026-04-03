import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ADMIN_SESSION_COOKIE, isAdminSessionValid } from '@/lib/admin-auth'
import { appendLog, getTaskById, updateTaskStatus } from '@/lib/db'
import { inngest } from '@/inngest/client'

interface DecisionBody {
  decision?: 'approve' | 'reject'
  note?: string
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

  const body = (await request.json().catch(() => ({}))) as DecisionBody
  const decision = body.decision
  if (decision !== 'approve' && decision !== 'reject') {
    return NextResponse.json({ error: 'Invalid decision' }, { status: 400 })
  }

  const task = await getTaskById(taskId)
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  const actor = 'admin-dashboard'
  const gateName = task.gate_current || 'manual-review'
  const note = (body.note || '').trim()

  if (decision === 'approve') {
    await updateTaskStatus(taskId, 'approved', 100)
    await appendLog(taskId, actor, `Approved in dashboard for gate ${gateName}${note ? `: ${note}` : ''}`)

    // Emit orchestration event when event key is configured.
    if (process.env.INNGEST_EVENT_KEY) {
      await inngest.send({
        name: 'orchestration/gate.approved',
        data: {
          taskId,
          gateName,
          approvedBy: actor,
          answers: {
            decision: 'approve',
            note: note || 'approved via dashboard',
          },
        },
      })
    }
  } else {
    await updateTaskStatus(taskId, 'rejected', 0)
    await appendLog(taskId, actor, `Rejected in dashboard for gate ${gateName}${note ? `: ${note}` : ''}`, 'warn')

    if (process.env.INNGEST_EVENT_KEY) {
      await inngest.send({
        name: 'orchestration/gate.hard_blocked',
        data: {
          taskId,
          gateName,
          blockedBy: actor,
          blockReason: note || 'rejected via dashboard',
          blockedAnswers: {
            decision: 'reject',
          },
        },
      })
    }
  }

  return NextResponse.json({ ok: true, taskId, decision })
}