import { NextRequest, NextResponse } from 'next/server'
import { validateWebhookRequest } from '@/lib/webhook-validator'
import { inngest } from '@/inngest/client'

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET

if (!WEBHOOK_SECRET) {
  console.error('GITHUB_WEBHOOK_SECRET is not set!')
}

/**
 * GitHub Webhook Receiver
 * Validates signed webhooks and routes to Inngest for processing
 */
export async function POST(request: NextRequest) {
  try {
    // Get headers
    const signature = request.headers.get('x-hub-signature-256') || ''
    const timestamp = request.headers.get('x-github-hook-id') || ''
    const eventType = request.headers.get('x-github-event') || ''

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

    if (!validateWebhookRequest(body, signature, timestamp, WEBHOOK_SECRET)) {
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      )
    }

    // Parse payload
    const payload = JSON.parse(body)
    const { action, repository, pull_request, issue, workflow_run, check_suite, comment } = payload

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
            headSha: check_suite.head_sha,
            htmlUrl: check_suite.html_url,
          },
        })
      }
    }

    if (eventType === 'pull_request' && pull_request) {
      const { action: prAction } = payload
      if (prAction === 'labeled' && payload.label?.name === 'orchestration') {
        await inngest.send({
          name: 'orchestration/pr.labeled',
          data: {
            prNumber: pull_request.number,
            repo: repository.full_name,
            branch: pull_request.head.ref,
            owner: repository.owner.login,
            title: pull_request.title,
            label: payload.label.name,
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
