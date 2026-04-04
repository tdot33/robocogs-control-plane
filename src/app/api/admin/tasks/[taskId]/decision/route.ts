import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ADMIN_SESSION_COOKIE, isAdminSessionValid } from '@/lib/admin-auth'
import { appendLog, createGateApproval, getTaskById, setTaskGate, updateTaskStatus } from '@/lib/db'
import { areGateAnswersComplete } from '@/lib/gates'
import { applyApprovedGateTransition } from '@/lib/gate-approval-flow'
import { validateTaskIssueBranchPair } from '@/lib/traceability'

interface DecisionBody {
  decision?: 'approve' | 'reject'
  note?: string
  answers?: Record<string, string>
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
  const answers = Object.fromEntries(
    Object.entries(body.answers || {}).map(([key, value]) => [key, String(value || '').trim()])
  )

  if (decision === 'approve') {
    if (!areGateAnswersComplete(gateName, answers)) {
      return NextResponse.json({ error: 'All gate questions must be answered before approval' }, { status: 400 })
    }

    const traceability =
      gateName === 'plan-approval' ? validateTaskIssueBranchPair(task.branch, task.issue_number) : null

    if (traceability && traceability.status !== 'valid' && traceability.status !== 'not-required') {
      return NextResponse.json({ error: traceability.message }, { status: 409 })
    }

    const approvalAnswers: Record<string, string | boolean> = {
      ...answers,
      decision: 'approve',
    }
    if (note) {
      approvalAnswers.note = note
    }

    await createGateApproval({
      taskId,
      gateName,
      approvedBy: actor,
      answers: approvalAnswers,
    })

    if (traceability) {
      await appendLog(taskId, 'traceability-guard', traceability.message)
    }

    await applyApprovedGateTransition({
      taskId,
      gateName,
      actor,
      answers: approvalAnswers,
      note,
    })
  } else {
    await updateTaskStatus(taskId, 'rejected', 0)
    await setTaskGate(taskId, gateName)
    await appendLog(taskId, actor, `Rejected in dashboard for gate ${gateName}${note ? `: ${note}` : ''}`, 'warn')
  }

  return NextResponse.json({ ok: true, taskId, decision })
}