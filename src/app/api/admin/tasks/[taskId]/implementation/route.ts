import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ADMIN_SESSION_COOKIE, isAdminSessionValid } from '@/lib/admin-auth'
import { inngest } from '@/inngest/client'
import { appendLog, getTaskById, getTaskLogs, setTaskAgent, setTaskGate, updateTaskStatus } from '@/lib/db'
import { findLatestMergeApprovalContext, getMergeApprovalReadiness } from '@/lib/merge-approval'
import {
  buildAuditorReviewPackage,
  buildImplementationEvidence,
  serializeAuditorReviewPackageLog,
  serializeImplementationEvidenceLog,
} from '@/lib/plan-package'

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
  const auditorReviewPackage = buildAuditorReviewPackage({
    task,
    implementationEvidence: evidence,
  })
  await setTaskAgent(taskId, 'auditor')
  await appendLog(taskId, 'auditor', 'Assigned auditor to review submitted implementation evidence')
  await appendLog(taskId, 'auditor', serializeAuditorReviewPackageLog(auditorReviewPackage), 'debug')
  await updateTaskStatus(taskId, 'running', Math.max(task.progress, 65))

  const logs = await getTaskLogs(taskId)
  const readiness = getMergeApprovalReadiness({
    task,
    logs,
    ciContext: findLatestMergeApprovalContext(logs),
  })

  if (readiness.state === 'ready') {
    await updateTaskStatus(taskId, 'awaiting_approval', 85)
    await setTaskGate(taskId, 'merge-approval')
    await appendLog(taskId, 'implementer', 'Implementation evidence satisfied the final merge gate prerequisite; queued merge approval')
    await inngest.send({
      name: 'orchestration/gate.awaiting_approval',
      data: {
        taskId,
        gateName: 'merge-approval',
        questionPackId: 'merge-approval',
        repoOwner: readiness.ciContext.repoOwner,
        repoName: readiness.ciContext.repoName,
        prNumber: readiness.ciContext.prNumber || undefined,
        installationId: readiness.ciContext.installationId,
      },
    })
  } else if (readiness.state === 'waiting-for-ci') {
    await appendLog(taskId, 'implementer', 'Implementation evidence recorded; awaiting CI success before opening merge approval')
  }

  return NextResponse.json({ ok: true, taskId, evidence, auditorReviewPackage })
}