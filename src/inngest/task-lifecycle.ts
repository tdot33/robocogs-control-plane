import { inngest, OrchestrationEvents } from './client'
import { updateTaskStatus, appendLog, createTask } from '@/lib/db'

/**
 * Task lifecycle handler: Manages all state transitions for AgentTask
 */
export const taskLifecycle = inngest.createFunction(
  { id: 'task-lifecycle', concurrency: { limit: 5 } },
  { event: 'orchestration/task.created' },
  async ({ event, step }) => {
    const {
      taskId,
      taskName,
      assignedAgent,
      branchName,
      issueNumber,
      scopeSlice,
      repoOwner,
      repoName,
    } = event.data

    try {
      // Step 1: Create task record
      await step.run('create-task-record', async () => {
        await createTask({
          id: taskId,
          task_name: taskName,
          assigned_agent: assignedAgent as any,
          status: 'pending',
          progress: 0,
          branch: branchName,
          issue_number: issueNumber || null,
          scope_slice: scopeSlice || null,
          gate_current: 'intake', // Tasks always start at intake gate
        })
        await appendLog(taskId, 'task-lifecycle', `Task created: ${taskName} - ${assignedAgent}`)
      })

      // Step 2: Post-create lifecycle hooks (e.g., notify orchestration dashboard)
      await step.run('notify-created', async () => {
        // Could dispatch to dashboard or external system
        await appendLog(taskId, 'task-lifecycle', `Notified: task created in orchestration dashboard`)
      })

      return {
        status: 'created',
        taskId,
        taskName,
        assignedAgent,
        branch: branchName,
      }
    } catch (error) {
      await appendLog(taskId, 'task-lifecycle', `Error in task creation: ${error}`, 'error')
      throw error
    }
  }
)

/**
 * Status update handler: Logs and processes state transitions
 */
export const statusUpdateHandler = inngest.createFunction(
  { id: 'status-update-handler', concurrency: { limit: 5 } },
  { event: 'orchestration/task.status_updated' },
  async ({ event, step }) => {
    const { taskId, previousStatus, newStatus, progress, message } = event.data

    await step.run('process-status-update', async () => {
      if (progress !== undefined) {
        await updateTaskStatus(taskId, newStatus as any, progress)
      } else {
        await updateTaskStatus(taskId, newStatus as any)
      }

      const msgLine = message ? ` — ${message}` : ''
      await appendLog(
        taskId,
        'status-update-handler',
        `Status transition: ${previousStatus} → ${newStatus}${msgLine}`
      )
    })

    // Step 2: Handle terminal states (completion, rejection, failure)
    if (['complete', 'rejected', 'failed'].includes(newStatus)) {
      await step.run('finalize-task', async () => {
        await appendLog(
          taskId,
          'task-lifecycle',
          `Task reached terminal state: ${newStatus}`,
          newStatus === 'complete' ? 'info' : 'warn'
        )
      })
    }

    return { status: 'processed', taskId, newStatus }
  }
)

/**
 * Commit traceability failure handler: Logs and escalates commit metadata issues
 */
export const commitTraceabilityHandler = inngest.createFunction(
  { id: 'commit-traceability-handler', concurrency: { limit: 3 } },
  { event: 'orchestration/commit.traceability_failure' },
  async ({ event, step }) => {
    const { taskId, commitHash, branch, failureMode, details } = event.data

    await step.run('handle-traceability-failure', async () => {
      await updateTaskStatus(taskId, 'failed', 0)
      await appendLog(
        taskId,
        'commit-traceability',
        `Commit traceability failure: ${failureMode} on ${branch} (${commitHash}): ${details}`,
        'error'
      )
    })

    return { status: 'traceability_failure_logged', taskId, failureMode }
  }
)

/**
 * Scope conflict handler: Manages parallel session scope conflicts
 */
export const scopeConflictHandler = inngest.createFunction(
  { id: 'scope-conflict-handler', concurrency: { limit: 2 } },
  { event: 'orchestration/session.scope_conflict' },
  async ({ event, step }) => {
    const { taskId, scopeSlice, conflictingTask, resolution } = event.data

    await step.run('handle-scope-conflict', async () => {
      await appendLog(
        taskId,
        'scope-conflict-handler',
        `Scope conflict detected on ${scopeSlice} with task ${conflictingTask}. Resolution: ${resolution}`,
        'warn'
      )

      // If auto-resolution failed, escalate to awaiting approval
      if (resolution === 'escalate_to_founder') {
        await updateTaskStatus(taskId, 'awaiting_approval', 25)
      }
    })

    return { status: 'scope_conflict_handled', taskId, scopeSlice }
  }
)
