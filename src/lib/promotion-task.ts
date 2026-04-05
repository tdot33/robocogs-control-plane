import { appendLog, createTask, getTaskByBranch, type AgentTask } from './db'
import { buildPromotionPackage, serializePromotionPackageLog } from './plan-package'

export async function ensurePromotionTask(input: {
  prNumber: number
  title: string
  baseBranch: string
  headBranch: string
  htmlUrl: string
}) {
  const promotionBranchKey = `promotion:${input.headBranch}->${input.baseBranch}#${input.prNumber}`
  const existingTask = await getTaskByBranch(promotionBranchKey)
  if (existingTask) {
    await appendLog(existingTask.id, 'promotion-task', `Observed promotion PR #${input.prNumber}: ${input.htmlUrl}`)
    return {
      task: existingTask,
      created: false,
    }
  }

  const taskId = `promotion-pr-${input.prNumber}`
  const createdTask: Omit<AgentTask, 'created_at' | 'updated_at'> = {
    id: taskId,
    task_name: input.title,
    assigned_agent: 'historian',
    status: 'awaiting_approval',
    progress: 92,
    branch: promotionBranchKey,
    issue_number: null,
    scope_slice: null,
    gate_current: 'promotion-approval',
  }

  const task = await createTask(createdTask)
  const promotionPackage = buildPromotionPackage({
    task,
    prNumber: input.prNumber,
    baseBranch: input.baseBranch,
    headBranch: input.headBranch,
    htmlUrl: input.htmlUrl,
  })

  await appendLog(taskId, 'promotion-task', `Created promotion approval task from PR #${input.prNumber}`)
  await appendLog(taskId, 'promotion-task', serializePromotionPackageLog(promotionPackage), 'debug')

  return {
    task,
    created: true,
  }
}