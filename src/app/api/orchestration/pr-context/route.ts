import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { loadTaskPrContext } from '@/lib/task-pr-context'

const requestSchema = z.object({
  taskId: z.string().trim().min(1).optional(),
  issueNumber: z.number().int().positive().optional(),
  branchName: z.string().trim().min(1).optional(),
  prNumber: z.number().int().positive().optional(),
  headBranch: z.string().trim().min(1).optional(),
  baseBranch: z.string().trim().min(1).optional(),
})

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

export async function POST(request: NextRequest) {
  if (!hasValidSharedSecret(request.headers.get('x-orchestration-secret'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 })
  }

  const { taskId, issueNumber, branchName, prNumber, headBranch, baseBranch } = parsed.data
  if (!taskId && !issueNumber && !branchName && !(prNumber && headBranch && baseBranch)) {
    return NextResponse.json({ error: 'A task locator is required' }, { status: 400 })
  }

  const context = await loadTaskPrContext({
    taskId,
    issueNumber,
    branchName,
    prNumber,
    headBranch,
    baseBranch,
  })

  if (!context) {
    return NextResponse.json({ error: 'Task context not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, context })
}