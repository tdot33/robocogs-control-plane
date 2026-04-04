import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { appendLog, getTaskByBranch } from '@/lib/db'
import { inngest } from '@/inngest/client'

interface PromotionStartPayload {
  prNumber?: number
  title?: string
  baseBranch?: string
  headBranch?: string
  htmlUrl?: string
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

export async function POST(request: NextRequest) {
  if (!hasValidSharedSecret(request.headers.get('x-orchestration-secret'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as PromotionStartPayload
  const prNumber = Number(body.prNumber || 0)
  const title = String(body.title || '').trim()
  const baseBranch = String(body.baseBranch || '').trim()
  const headBranch = String(body.headBranch || '').trim()
  const htmlUrl = String(body.htmlUrl || '').trim()
  const repoOwner = String(body.repoOwner || '').trim()
  const repoName = String(body.repoName || '').trim()
  const installationId = Number(await request.headers.get('x-installation-id') || 0)

  if (!prNumber || !title || !baseBranch || !headBranch || !repoOwner || !repoName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const promotionBranchKey = `promotion:${headBranch}->${baseBranch}#${prNumber}`
  const existingTask = await getTaskByBranch(promotionBranchKey)
  if (existingTask) {
    await appendLog(existingTask.id, 'promotion-start-intake', `Observed direct promotion handoff for PR #${prNumber}`)
    return NextResponse.json({ ok: true, taskId: existingTask.id, created: false })
  }

  await inngest.send({
    name: 'orchestration/promotion.requested',
    data: {
      prNumber,
      repo: `${repoOwner}/${repoName}`,
      repoOwner,
      repoName,
      baseBranch,
      headBranch,
      title,
      htmlUrl,
      installationId,
    },
  })

  return NextResponse.json({ ok: true, taskId: `promotion-pr-${prNumber}`, created: true })
}