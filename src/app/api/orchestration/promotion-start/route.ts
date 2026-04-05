import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { setTaskGate } from '@/lib/db'
import { getRepoInstallationId } from '@/lib/github'
import { ensurePromotionTask } from '@/lib/promotion-task'
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
  let installationId = Number(request.headers.get('x-installation-id') || 0)

  if (!prNumber || !title || !baseBranch || !headBranch || !repoOwner || !repoName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (!installationId) {
    try {
      installationId = await getRepoInstallationId(repoOwner, repoName)
    } catch {
      installationId = 0
    }
  }

  const { task, created } = await ensurePromotionTask({
    prNumber,
    title,
    baseBranch,
    headBranch,
    htmlUrl,
  })

  await setTaskGate(task.id, 'promotion-approval')
  await inngest.send({
    name: 'orchestration/gate.awaiting_approval',
    data: {
      taskId: task.id,
      gateName: 'promotion-approval',
      questionPackId: 'promotion-approval',
      repoOwner,
      repoName,
      prNumber,
      installationId,
    },
  })

  return NextResponse.json({ ok: true, taskId: task.id, created })
}