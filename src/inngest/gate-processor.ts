import { inngest } from './client'
import { updateTaskStatus, appendLog, getTaskById, createGateApproval } from '@/lib/db'
import { createIssueComment } from '@/lib/github'
import { areGateAnswersComplete, GATE_QUESTION_PACKS } from '@/lib/gates'
import { applyApprovedGateTransition, normalizeApprovalAnswers } from '@/lib/gate-approval-flow'

function coerceAnswer(value: string): string | boolean {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'yes' || normalized === 'true' || normalized === 'approve' || normalized === 'go') {
    return true
  }
  if (normalized === 'no' || normalized === 'false' || normalized === 'reject' || normalized === 'hold') {
    return false
  }
  return value.trim()
}

function parseGateResponse(commentBody: string):
  | { decision: 'approve' | 'reject'; taskId: string; answers: Record<string, string | boolean> }
  | null {
  const normalized = commentBody.trim()
  const match = normalized.match(/^(approve|reject)\s+([^\s]+)(?:\s+([\s\S]+))?$/i)
  if (!match) {
    return null
  }

  const decision = match[1].toLowerCase() as 'approve' | 'reject'
  const taskId = match[2]
  const answers: Record<string, string | boolean> = { decision }
  const args = (match[3] || '').trim()

  if (!args) {
    return { decision, taskId, answers }
  }

  for (const token of args.split(/\s+/)) {
    const splitIndex = token.indexOf('=')
    if (splitIndex === -1) {
      continue
    }
    const key = token.slice(0, splitIndex).trim()
    const value = token.slice(splitIndex + 1).trim()
    if (!key || !value) {
      continue
    }
    answers[key] = coerceAnswer(value)
  }

  return { decision, taskId, answers }
}

/**
 * Formats gate question pack as GitHub issue comment with click-first options
 */
export function formatGateQuestionComment(gateName: string, taskId: string): string {
  const pack = GATE_QUESTION_PACKS[gateName]
  if (!pack) {
    return `**Gate Approval Required: ${gateName}**\nNo question pack found for gate.`
  }

  const lines = [
    `## 🚪 Gate Approval: ${gateName}`,
    `**Task ID:** \`${taskId}\``,
    '',
    '**Please respond with one of the following options:**',
    '',
  ]

  pack.questions.forEach((q, idx) => {
    lines.push(`### ${idx + 1}. ${q.label}`)
    if (q.type === 'yes-no') {
      lines.push(`- [ ] ✅ Yes - \`approve ${taskId} ${q.id}=yes\``)
      lines.push(`- [ ] ❌ No - \`reject ${taskId} ${q.id}=no\``)
    } else if (q.type === 'single-choice') {
      lines.push(`- [ ] Hold - \`approve ${taskId} ${q.id}=hold\``)
      lines.push(`- [ ] Go - \`approve ${taskId} ${q.id}=go\``)
    }
    lines.push('')
  })

  lines.push('---')
  lines.push('_Respond by posting a comment with the appropriate command above._')

  return lines.join('\n')
}

/**
 * Gate processor: Posts gate questions as GitHub comment and waits for founder approval
 */
export const gateProcessor = inngest.createFunction(
  { id: 'gate-processor', concurrency: { limit: 2 } },
  { event: 'orchestration/gate.awaiting_approval' },
  async ({ event, step }) => {
    const { taskId, gateName, questionPackId, repoOwner, repoName, prNumber, issueNumber, installationId } = event.data

    try {
      // Step 1: Update task status to awaiting_approval
      await step.run('update-task-status', async () => {
        await updateTaskStatus(taskId, 'awaiting_approval', 50)
        await appendLog(taskId, 'gate-processor', `Gate ${gateName} awaiting founder approval`)
      })

      // Step 2: Post gate questions as GitHub comment
      const commentId = await step.run('post-gate-questions', async () => {
        const body = formatGateQuestionComment(gateName, taskId)
        const comment = await createIssueComment(
          installationId,
          repoOwner,
          repoName,
          issueNumber || prNumber || 0, // Fallback if neither provided
          body
        )
        await appendLog(taskId, 'gate-processor', `Posted gate question comment: ${comment.url}`)
        return comment.id
      })

      // Step 3: Wait for gate approval event (7-day timeout)
      const approval = await step.waitForEvent('wait-for-approval', {
        event: 'orchestration/gate.approved',
        timeout: '7d',
        // Inngest expects a field-path string here and compares values across events.
        match: 'data.taskId',
      }).catch(async () => {
        // On timeout, update task to failed
        await updateTaskStatus(taskId, 'failed', 0)
        await appendLog(taskId, 'gate-processor', `Gate approval timeout after 7 days`, 'warn')
        return null
      })

      if (!approval) {
        await step.run('handle-timeout', async () => {
          await updateTaskStatus(taskId, 'failed', 0)
        })
        return { status: 'timeout', taskId }
      }

      // Step 4: Update task to approved
      await step.run('finalize-approval', async () => {
        await applyApprovedGateTransition({
          taskId,
          gateName,
          actor: 'gate-processor',
          approvedBy: approval.data.approvedBy,
          answers: approval.data.answers,
        })
      })

      return { status: 'approved', taskId, gateName, answers: approval.data.answers }
    } catch (error) {
      await updateTaskStatus(taskId, 'failed', 0)
      await appendLog(taskId, 'gate-processor', `Error processing gate: ${error}`, 'error')
      throw error
    }
  }
)

/**
 * Hard-block processor: Handles gate rejections (hard blocks)
 */
export const hardBlockProcessor = inngest.createFunction(
  { id: 'hard-block-processor', concurrency: { limit: 2 } },
  { event: 'orchestration/gate.hard_blocked' },
  async ({ event, step }) => {
    const { taskId, gateName, blockedBy, blockReason } = event.data

    await step.run('handle-hard-block', async () => {
      await updateTaskStatus(taskId, 'rejected', 0)
      await appendLog(
        taskId,
        'hard-block-processor',
        `Gate ${gateName} hard-blocked by ${blockedBy}: ${blockReason}`,
        'warn'
      )
    })

    return { status: 'hard_blocked', taskId, gateName }
  }
)

export const gateResponseHandler = inngest.createFunction(
  { id: 'gate-response-handler', concurrency: { limit: 5 } },
  { event: 'orchestration/gate.response' },
  async ({ event, step }) => {
    const parsed = parseGateResponse(event.data.commentBody)
    if (!parsed) {
      return { status: 'ignored-unrecognized-comment', commentId: event.data.commentId }
    }

    const task = await step.run('load-task', async () => getTaskById(parsed.taskId))
    if (!task) {
      return { status: 'ignored-task-not-found', taskId: parsed.taskId }
    }

    await step.run('log-gate-response', async () => {
      await appendLog(task.id, 'gate-response-handler', `Received ${parsed.decision} response from ${event.data.author}`)
    })

    if (parsed.decision === 'approve') {
      const normalizedAnswers = normalizeApprovalAnswers(parsed.answers)
      if (!areGateAnswersComplete(task.gate_current, normalizedAnswers)) {
        await step.run('reject-incomplete-approval', async () => {
          await appendLog(
            task.id,
            'gate-response-handler',
            `Ignored incomplete approval response from ${event.data.author} for gate ${task.gate_current || 'unknown'}`,
            'warn'
          )
        })

        return { status: 'ignored-incomplete-approval', taskId: task.id }
      }

      await step.run('record-approval', async () => {
        await createGateApproval({
          taskId: task.id,
          gateName: task.gate_current || 'unknown',
          approvedBy: event.data.author,
          answers: parsed.answers,
          commentUrl: event.data.htmlUrl,
          commentId: event.data.commentId,
        })
      })

      await step.run('emit-approval-event', async () => {
        await inngest.send({
          name: 'orchestration/gate.approved',
          data: {
            taskId: task.id,
            gateName: task.gate_current || 'unknown',
            approvedBy: event.data.author,
            answers: parsed.answers,
          },
        })
      })

      return { status: 'approved', taskId: task.id }
    }

    await step.run('emit-rejection-event', async () => {
      await inngest.send({
        name: 'orchestration/gate.hard_blocked',
        data: {
          taskId: task.id,
          gateName: task.gate_current || 'unknown',
          blockedBy: event.data.author,
          blockReason:
            typeof parsed.answers.reason === 'string' && parsed.answers.reason
              ? parsed.answers.reason
              : 'Rejected via GitHub comment',
          blockedAnswers: parsed.answers,
        },
      })
    })

    return { status: 'rejected', taskId: task.id }
  }
)
