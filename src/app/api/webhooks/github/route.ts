import { NextRequest, NextResponse } from 'next/server'
import { validateWebhookSignature } from '@/lib/webhook-validator'
import { inngest } from '@/inngest/client'
import { appendLog, createTask, getTaskByIssueNumber, setTaskGate } from '@/lib/db'
import { createIssueComment } from '@/lib/github'
import { formatGateQuestionComment } from '@/inngest/gate-processor'
import { ensurePromotionTask } from '@/lib/promotion-task'

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET
const WEBHOOK_FORWARD_URL = process.env.WEBHOOK_FORWARD_URL
const WEBHOOK_FORWARD_AUTH_MODE = (process.env.WEBHOOK_FORWARD_AUTH_MODE || 'none').toLowerCase()
const WEBHOOK_FORWARD_AUDIENCE = process.env.WEBHOOK_FORWARD_AUDIENCE
const ORCHESTRATION_LABEL = 'orchestration'

if (!WEBHOOK_SECRET) {
  console.error('GITHUB_WEBHOOK_SECRET is not set!')
}

async function getCloudRunIdToken(audience: string): Promise<string> {
  const tokenUrl =
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=' +
    encodeURIComponent(audience)

  const response = await fetch(tokenUrl, {
    headers: {
      'Metadata-Flavor': 'Google',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to mint Cloud Run identity token (${response.status})`)
  }

  return response.text()
}

async function forwardWebhook(request: NextRequest, body: string, eventType: string, signature: string): Promise<Response> {
  if (!WEBHOOK_FORWARD_URL) {
    throw new Error('WEBHOOK_FORWARD_URL is not configured')
  }

  const headers = new Headers({
    'content-type': request.headers.get('content-type') || 'application/json',
    'x-hub-signature-256': signature,
    'x-github-event': eventType,
    'x-github-delivery': request.headers.get('x-github-delivery') || '',
    'x-forwarded-by': 'robocogs-ingress-bridge',
  })

  if (WEBHOOK_FORWARD_AUTH_MODE === 'oidc') {
    const audience = WEBHOOK_FORWARD_AUDIENCE || WEBHOOK_FORWARD_URL
    const idToken = await getCloudRunIdToken(audience)
    headers.set('authorization', `Bearer ${idToken}`)
  }

  return fetch(WEBHOOK_FORWARD_URL, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(10000),
  })
}

async function ensureTaskForOrchestrationPr(input: {
  prNumber: number
  title: string
  branch: string
  repoOwner: string
  repoName: string
  installationId: number
}) {
  const existingTask = await getTaskByIssueNumber(input.prNumber)
  if (existingTask) {
    await appendLog(existingTask.id, 'webhook-pr-fallback', `Observed orchestration label on PR #${input.prNumber}`)
    return { taskId: existingTask.id, created: false }
  }

  const taskId = `pr-${input.prNumber}`
  await createTask({
    id: taskId,
    task_name: input.title,
    assigned_agent: 'architect',
    status: 'awaiting_approval',
    progress: 50,
    branch: input.branch,
    issue_number: input.prNumber,
    scope_slice: null,
    gate_current: 'intake',
  })

  await appendLog(taskId, 'webhook-pr-fallback', `Created orchestration task from PR #${input.prNumber}`)

  if (input.installationId > 0) {
    const comment = await createIssueComment(
      input.installationId,
      input.repoOwner,
      input.repoName,
      input.prNumber,
      formatGateQuestionComment('intake', taskId)
    )
    await appendLog(taskId, 'webhook-pr-fallback', `Posted intake gate comment: ${comment.url}`)
  } else {
    await appendLog(taskId, 'webhook-pr-fallback', 'Skipped intake gate comment because installationId was missing', 'warn')
  }

  return { taskId, created: true }
}

/**
 * GitHub Webhook Receiver
 * Validates signed webhooks and routes to Inngest for processing
 */
export async function POST(request: NextRequest) {
  try {
    // Get headers
    const signature = request.headers.get('x-hub-signature-256') || ''
    const eventType = request.headers.get('x-github-event') || ''
    const forwardedBy = request.headers.get('x-forwarded-by') || ''

    if (!signature || !eventType) {
      return NextResponse.json(
        { error: 'Missing required headers' },
        { status: 400 }
      )
    }

    // Read body as text for signature validation
    const body = await request.text()

    // Validate webhook signature
    if (!WEBHOOK_SECRET) {
      return NextResponse.json(
        { error: 'Server not configured for webhooks' },
        { status: 500 }
      )
    }

    if (!validateWebhookSignature(body, signature, WEBHOOK_SECRET)) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      )
    }

    // Bridge mode: validate at edge and forward to private backend.
    if (WEBHOOK_FORWARD_URL) {
      if (forwardedBy === 'robocogs-ingress-bridge') {
        return NextResponse.json(
          { error: 'Bridge forwarding loop detected' },
          { status: 500 }
        )
      }

      const forwardResponse = await forwardWebhook(request, body, eventType, signature)

      if (!forwardResponse.ok) {
        const details = await forwardResponse.text().catch(() => 'forwarding failed')
        return NextResponse.json(
          {
            error: 'Failed to forward webhook',
            downstreamStatus: forwardResponse.status,
            details,
          },
          { status: 502 }
        )
      }

      return NextResponse.json(
        { message: 'Webhook validated and forwarded' },
        { status: 202 }
      )
    }

    // Parse payload
    const payload = JSON.parse(body)
    const { action, repository, pull_request, issue, check_suite, comment, installation } = payload
    const installationId = Number(installation?.id || 0)
    const repoOwner = repository?.owner?.login || ''
    const repoName = repository?.name || ''

    console.log('GitHub webhook received', {
      eventType,
      action,
      repo: repository?.full_name || '',
      installationId,
      deliveryId: request.headers.get('x-github-delivery') || '',
    })

    // Route based on event type
    if (eventType === 'check_suite' && check_suite) {
      const { status, conclusion } = check_suite
      if (status === 'completed') {
        await inngest.send({
          name: 'orchestration/ci.check_completed',
          data: {
            checkSuiteId: check_suite.id,
            status: conclusion,
            workflowName: check_suite.app?.name || 'unknown',
            repo: repository.full_name,
            repoOwner,
            repoName,
            installationId,
            headSha: check_suite.head_sha,
            headBranch: check_suite.head_branch || '',
            htmlUrl: check_suite.html_url,
          },
        })
      }
    }

    if (eventType === 'pull_request' && pull_request) {
      const { action: prAction } = payload
      const labelNames = Array.isArray(pull_request.labels) ? pull_request.labels.map((label: { name?: string }) => label.name).filter(Boolean) : []
      const hasOrchestrationLabel = payload.label?.name === ORCHESTRATION_LABEL || labelNames.includes(ORCHESTRATION_LABEL)
      const shouldTriggerOrchestration = hasOrchestrationLabel && ['labeled', 'opened', 'reopened', 'synchronize', 'ready_for_review'].includes(prAction)
      const isPromotionPr = pull_request.base?.ref === 'master' && pull_request.head?.ref === 'chet-dev'
      const shouldTriggerPromotion = isPromotionPr && ['opened', 'reopened', 'synchronize', 'ready_for_review'].includes(prAction)

      if (shouldTriggerOrchestration) {
        await inngest.send({
          name: 'orchestration/pr.labeled',
          data: {
            prNumber: pull_request.number,
            repo: repository.full_name,
            branch: pull_request.head.ref,
            owner: repoOwner,
            repoName,
            title: pull_request.title,
            label: ORCHESTRATION_LABEL,
            installationId,
          },
        })

        await ensureTaskForOrchestrationPr({
          prNumber: pull_request.number,
          title: pull_request.title,
          branch: pull_request.head.ref,
          repoOwner,
          repoName,
          installationId,
        })
      }

      if (shouldTriggerPromotion) {
        const promotionTask = await ensurePromotionTask({
          prNumber: pull_request.number,
          title: pull_request.title,
          baseBranch: pull_request.base.ref,
          headBranch: pull_request.head.ref,
          htmlUrl: pull_request.html_url,
        })

        await setTaskGate(promotionTask.task.id, 'promotion-approval')
        await inngest.send({
          name: 'orchestration/gate.awaiting_approval',
          data: {
            taskId: promotionTask.task.id,
            gateName: 'promotion-approval',
            questionPackId: 'promotion-approval',
            repoOwner,
            repoName,
            prNumber: pull_request.number,
            installationId,
          },
        })
      }
    }

    if (eventType === 'issue_comment' && comment && issue) {
      // Check if comment is a gate approval response
      if (comment.body.includes('approve') || comment.body.includes('reject')) {
        await inngest.send({
          name: 'orchestration/gate.response',
          data: {
            issueNumber: issue.number,
            commentId: comment.id,
            commentBody: comment.body,
            author: comment.user.login,
            repo: repository.full_name,
            repoOwner,
            repoName,
            installationId,
            htmlUrl: comment.html_url,
          },
        })
      }
    }

    // Return 202 Accepted immediately (async processing via Inngest)
    return NextResponse.json(
      { message: 'Webhook received and queued for processing' },
      { status: 202 }
    )
  } catch (error) {
    console.error('Webhook processing error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
