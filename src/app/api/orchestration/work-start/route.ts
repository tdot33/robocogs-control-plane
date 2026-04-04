import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { appendLog, createTask, getTaskByBranch, getTaskByIssueNumber } from '@/lib/db'
import { createIssueComment, getRepoInstallationId } from '@/lib/github'
import { formatGateQuestionComment } from '@/inngest/gate-processor'

interface WorkStartPayload {
  workKey?: string
  type?: string
  title?: string
  issueNumber?: number
  branchName?: string
  repoOwner?: string
  repoName?: string
}

function hasValidSharedSecret(secretHeader: string | null): boolean {
  const configured = process.env.ORCHESTRATION_SHARED_SECRET?.trim()
  const presented = (secretHeader || '').trim()

  if (!configured || !presented) {
    return false
  }

  const expected = Buffer.from(configured)
  const actual = Buffer.from(presented)
  if (expected.length !== actual.length) {
    return false
  }

  return crypto.timingSafeEqual(expected, actual)
}

function buildTaskId(payload: Required<Pick<WorkStartPayload, 'workKey' | 'issueNumber'>>) {
  if (payload.issueNumber) {
    return `issue-${payload.issueNumber}`
  }

  const slug = payload.workKey.replace(/[^a-zA-Z0-9_-]/g, '').slice(-24) || `work-${Date.now()}`
  return `work-${slug}`
}

export async function POST(request: NextRequest) {
  if (!hasValidSharedSecret(request.headers.get('x-orchestration-secret'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as WorkStartPayload
  const title = String(body.title || '').trim()
  const branchName = String(body.branchName || '').trim()
  const repoOwner = String(body.repoOwner || '').trim()
  const repoName = String(body.repoName || '').trim()
  const workKey = String(body.workKey || '').trim()
  const issueNumber = Number(body.issueNumber || 0)
  const taskType = String(body.type || '').trim() || 'feature'

  if (!title || !branchName || !repoOwner || !repoName || !workKey) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const existingTask = issueNumber ? await getTaskByIssueNumber(issueNumber) : await getTaskByBranch(branchName)
  if (existingTask) {
    await appendLog(existingTask.id, 'work-start-intake', `Observed work:start handoff for branch ${branchName}`)
    return NextResponse.json({ ok: true, taskId: existingTask.id, created: false })
  }

  const taskId = buildTaskId({ workKey, issueNumber })
  await createTask({
    id: taskId,
    task_name: title,
    assigned_agent: 'architect',
    status: 'awaiting_approval',
    progress: 10,
    branch: branchName,
    issue_number: issueNumber || null,
    scope_slice: null,
    gate_current: 'intake',
  })

  await appendLog(taskId, 'work-start-intake', `Created orchestration task from work:start (${taskType})`)

  if (issueNumber > 0) {
    try {
      const installationId = await getRepoInstallationId(repoOwner, repoName)
      const comment = await createIssueComment(
        installationId,
        repoOwner,
        repoName,
        issueNumber,
        formatGateQuestionComment('intake', taskId)
      )
      await appendLog(taskId, 'work-start-intake', `Posted intake gate comment: ${comment.url}`)
    } catch (error) {
      await appendLog(taskId, 'work-start-intake', `Failed to post intake gate comment: ${error}`, 'warn')
    }
  }

  return NextResponse.json({ ok: true, taskId, created: true })
}