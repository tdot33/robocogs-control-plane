import { inngest, OrchestrationEvents } from './client'
import { updateTaskStatus, appendLog, getTaskById } from '@/lib/db'
import { createIssueComment } from '@/lib/github'

// Load gate question packs from robocogs repo (these would be synced)
const GATE_QUESTION_PACKS: Record<string, { questions: Array<{ id: string; label: string; type: 'yes-no' | 'single-choice' | 'multi-choice' }> }> = {
  'intake': {
    questions: [
      { id: 'scope-clear', label: 'Scope is clearly defined and achievable?', type: 'yes-no' },
      { id: 'risk-assessed', label: 'Risk posture assessed and acceptable?', type: 'yes-no' },
    ]
  },
  'plan-approval': {
    questions: [
      { id: 'plan-sound', label: 'Proposed implementation plan is sound?', type: 'yes-no' },
      { id: 'testability', label: 'Plan includes testability and validation?', type: 'yes-no' },
      { id: 'rollback-ready', label: 'Rollback strategy defined?', type: 'yes-no' },
    ]
  },
  'merge-approval': {
    questions: [
      { id: 'merge-decision', label: 'Approve merge to chet-dev?', type: 'single-choice' },
      { id: 'evidence-complete', label: 'Evidence package complete?', type: 'yes-no' },
      { id: 'docs-reviewed', label: 'Docs reviewed and updated?', type: 'yes-no' },
      { id: 'rollback-ready', label: 'Rollback procedure ready?', type: 'yes-no' },
    ]
  },
  'promotion-approval': {
    questions: [
      { id: 'promotion-decision', label: 'Promote to master?', type: 'single-choice' },
      { id: 'ci-release-status', label: 'CI release status?', type: 'single-choice' },
      { id: 'risk-posture', label: 'Risk posture?', type: 'single-choice' },
      { id: 'rollback-confirmed', label: 'Confirm rollback ready?', type: 'yes-no' },
    ]
  },
}

/**
 * Formats gate question pack as GitHub issue comment with click-first options
 */
function formatGateQuestionComment(gateName: string, taskId: string): string {
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
        await updateTaskStatus(taskId, 'approved', 100)
        await appendLog(
          taskId,
          'gate-processor',
          `Gate ${gateName} approved by ${approval.data.approvedBy}. Answers: ${JSON.stringify(approval.data.answers)}`
        )
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
