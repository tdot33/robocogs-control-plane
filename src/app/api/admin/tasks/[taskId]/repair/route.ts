import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { ADMIN_SESSION_COOKIE, isAdminSessionValid } from '@/lib/admin-auth'
import { appendLog, getLatestGateApproval, getTaskById, getTaskLogs, setTaskAgent, setTaskGate, updateTaskStatus } from '@/lib/db'
import {
  buildAuditorReviewPackage,
  buildImplementationPackage,
  buildPlanPackage,
  buildPromotionPackage,
  parseImplementationEvidenceLog,
  serializeAuditorReviewPackageLog,
  serializeImplementationPackageLog,
  serializePlanPackageLog,
  serializePromotionPackageLog,
} from '@/lib/plan-package'

type RepairAction =
  | 'regenerate-plan-package'
  | 'regenerate-implementation-package'
  | 'regenerate-auditor-review-package'
  | 'regenerate-promotion-package'
  | 'normalize-task-state'

interface RepairBody {
  action?: RepairAction
}

function parseApprovalAnswers(serialized: string) {
  try {
    const parsed = JSON.parse(serialized) as Record<string, string>
    return {
      answers: Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value ?? '')])),
      note: String(parsed.note || ''),
    }
  } catch {
    return {
      answers: {} as Record<string, string>,
      note: '',
    }
  }
}

function getLatestImplementationEvidence(logs: Awaited<ReturnType<typeof getTaskLogs>>) {
  for (const log of logs) {
    const evidence = parseImplementationEvidenceLog(log.message)
    if (evidence) {
      return evidence
    }
  }

  return null
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

  const body = (await request.json().catch(() => ({}))) as RepairBody
  const action = body.action
  if (!action) {
    return NextResponse.json({ error: 'Missing repair action' }, { status: 400 })
  }

  const task = await getTaskById(taskId)
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  if (action === 'regenerate-plan-package') {
    const intakeApproval = await getLatestGateApproval(taskId, 'intake')
    if (!intakeApproval) {
      return NextResponse.json({ error: 'Task has no intake approval to regenerate plan package from' }, { status: 409 })
    }

    const { answers, note } = parseApprovalAnswers(intakeApproval.answers)
    const planPackage = buildPlanPackage({ task, answers, note })
    await appendLog(taskId, 'admin-repair', 'Regenerated plan package from intake approval')
    await appendLog(taskId, 'admin-repair', serializePlanPackageLog(planPackage), 'debug')
    return NextResponse.json({ ok: true, action })
  }

  if (action === 'regenerate-implementation-package') {
    const planApproval = await getLatestGateApproval(taskId, 'plan-approval')
    if (!planApproval) {
      return NextResponse.json({ error: 'Task has no plan approval to regenerate implementation package from' }, { status: 409 })
    }

    const { answers, note } = parseApprovalAnswers(planApproval.answers)
    const implementationPackage = buildImplementationPackage({ task, answers, note })
    await setTaskAgent(taskId, 'implementer')
    await appendLog(taskId, 'admin-repair', 'Regenerated implementation package from plan approval')
    await appendLog(taskId, 'admin-repair', serializeImplementationPackageLog(implementationPackage), 'debug')
    return NextResponse.json({ ok: true, action })
  }

  if (action === 'regenerate-auditor-review-package') {
    const logs = await getTaskLogs(taskId)
    const implementationEvidence = getLatestImplementationEvidence(logs)
    if (!implementationEvidence) {
      return NextResponse.json({ error: 'Task has no implementation evidence to rebuild auditor review package from' }, { status: 409 })
    }

    const auditorReviewPackage = buildAuditorReviewPackage({ task, implementationEvidence })
    await setTaskAgent(taskId, 'auditor')
    await appendLog(taskId, 'admin-repair', 'Regenerated auditor review package from implementation evidence')
    await appendLog(taskId, 'admin-repair', serializeAuditorReviewPackageLog(auditorReviewPackage), 'debug')
    return NextResponse.json({ ok: true, action })
  }

  if (action === 'regenerate-promotion-package') {
    if (!task.branch?.startsWith('promotion:')) {
      return NextResponse.json({ error: 'Task is not a promotion task' }, { status: 409 })
    }

    const match = task.branch.match(/^promotion:(.+)->(.+)#(\d+)$/)
    if (!match) {
      return NextResponse.json({ error: 'Promotion branch metadata is incomplete' }, { status: 409 })
    }

    const promotionPackage = buildPromotionPackage({
      task,
      headBranch: match[1],
      baseBranch: match[2],
      prNumber: Number(match[3]),
      htmlUrl: 'Promotion PR URL recorded externally; verify against the GitHub PR before approval.',
    })
    await appendLog(taskId, 'admin-repair', 'Regenerated promotion package from promotion task metadata')
    await appendLog(taskId, 'admin-repair', serializePromotionPackageLog(promotionPackage), 'debug')
    return NextResponse.json({ ok: true, action })
  }

  if (action === 'normalize-task-state') {
    if (task.gate_current === 'implementation') {
      await updateTaskStatus(taskId, 'running', Math.max(task.progress, 40))
      await setTaskAgent(taskId, 'implementer')
    } else if (task.gate_current === 'merge-approval') {
      await updateTaskStatus(taskId, 'awaiting_approval', Math.max(task.progress, 85))
      await setTaskAgent(taskId, 'auditor')
    } else if (task.gate_current === 'promotion-approval') {
      await updateTaskStatus(taskId, 'awaiting_approval', Math.max(task.progress, 92))
      await setTaskAgent(taskId, 'historian')
    } else if (task.gate_current === 'done' || task.status === 'complete') {
      await updateTaskStatus(taskId, 'complete', 100)
      await setTaskGate(taskId, 'done')
      await setTaskAgent(taskId, 'historian')
    } else {
      await updateTaskStatus(taskId, 'awaiting_approval', Math.max(task.progress, 10))
    }

    await appendLog(taskId, 'admin-repair', `Normalized task state for gate ${task.gate_current || 'manual-review'}`)
    return NextResponse.json({ ok: true, action })
  }

  return NextResponse.json({ error: 'Unsupported repair action' }, { status: 400 })
}