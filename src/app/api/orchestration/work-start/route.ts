import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { appendLog, createTask, getInFlightTaskByScopeSlice, getInFlightTaskCount, getTaskByBranch, getTaskByIssueNumber } from '@/lib/db'
import { createIssueComment, getRepoInstallationId } from '@/lib/github'
import { formatGateQuestionComment } from '@/inngest/gate-processor'

const KNOWN_SCOPE_SLICES = new Set([
  'auth-and-host-surface',
  'invoice-processing',
  'workflow-and-api',
  'category-and-gl-mapping',
  'analytics-instrumentation',
  'docs-and-workflow',
])
const MAX_CONCURRENT_SESSIONS = 3

interface WorkStartPayload {
  workKey?: string
  type?: string
  title?: string
  issueNumber?: number
  branchName?: string
  scopeSlice?: string
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
  const scopeSlice = String(body.scopeSlice || '').trim().toLowerCase()
  const issueNumber = Number(body.issueNumber || 0)
  const taskType = String(body.type || '').trim() || 'feature'

  if (!title || !branchName || !repoOwner || !repoName || !workKey) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (scopeSlice && !KNOWN_SCOPE_SLICES.has(scopeSlice)) {
    return NextResponse.json({ error: `Unsupported scope slice: ${scopeSlice}` }, { status: 400 })
  }

  const existingTask = issueNumber ? await getTaskByIssueNumber(issueNumber) : await getTaskByBranch(branchName)
  if (existingTask) {
    await appendLog(existingTask.id, 'work-start-intake', `Observed work:start handoff for branch ${branchName}`)
    return NextResponse.json({ ok: true, taskId: existingTask.id, created: false })
  }

  const inFlightTaskCount = await getInFlightTaskCount()
  if (inFlightTaskCount >= MAX_CONCURRENT_SESSIONS) {
    return NextResponse.json(
      { error: `Concurrent implementation limit reached (${MAX_CONCURRENT_SESSIONS}). Finish or resequence an active session before starting another.` },
      { status: 429 }
    )
  }

  if (scopeSlice) {
    const conflictingTask = await getInFlightTaskByScopeSlice(scopeSlice)
    if (conflictingTask) {
      return NextResponse.json(
        {
          error: `Scope slice ${scopeSlice} is already active on task ${conflictingTask.id}. Re-sequence the work or request explicit overlap approval.`,
          conflictingTaskId: conflictingTask.id,
        },
        { status: 409 }
      )
    }
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
    scope_slice: scopeSlice || null,
    gate_current: 'intake',
  })

  const scopeSuffix = scopeSlice ? `, scope ${scopeSlice}` : ''
  await appendLog(taskId, 'work-start-intake', `Created orchestration task from work:start (${taskType}${scopeSuffix})`)

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