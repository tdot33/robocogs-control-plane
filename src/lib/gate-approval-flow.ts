import { appendLog, getTaskById, setTaskAgent, setTaskGate, updateTaskStatus } from './db'
import { getApprovalTransition } from './gates'
import {
  buildImplementationPackage,
  buildPlanPackage,
  serializeImplementationPackageLog,
  serializePlanPackageLog,
} from './plan-package'

type ApprovalAnswerValue = string | boolean | number | null | undefined

export function normalizeApprovalAnswers(
  answers: Record<string, ApprovalAnswerValue>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(answers).map(([key, value]) => {
      if (typeof value === 'boolean') {
        return [key, value ? 'yes' : 'no']
      }

      if (value === null || value === undefined) {
        return [key, '']
      }

      return [key, String(value).trim()]
    })
  )
}

export async function applyApprovedGateTransition(input: {
  taskId: string
  gateName: string
  actor: string
  answers: Record<string, ApprovalAnswerValue>
  note?: string
  approvedBy?: string
}) {
  const task = await getTaskById(input.taskId)
  if (!task) {
    throw new Error(`Task not found: ${input.taskId}`)
  }

  const normalizedAnswers = normalizeApprovalAnswers(input.answers)
  const note = (input.note || normalizedAnswers.note || '').trim()

  if (input.gateName === 'intake') {
    const planPackage = buildPlanPackage({
      task,
      answers: normalizedAnswers,
      note,
    })
    await appendLog(input.taskId, 'architect', 'Generated plan package for plan approval')
    await appendLog(input.taskId, 'architect', serializePlanPackageLog(planPackage), 'debug')
  }

  const transition = getApprovalTransition(input.gateName)
  await updateTaskStatus(input.taskId, transition.nextStatus, transition.nextProgress)
  await setTaskGate(input.taskId, transition.nextGate)

  if (input.gateName === 'plan-approval') {
    const implementationPackage = buildImplementationPackage({
      task,
      answers: normalizedAnswers,
      note,
    })
    await setTaskAgent(input.taskId, 'implementer')
    await appendLog(input.taskId, 'implementer', 'Generated implementation handoff package for execution')
    await appendLog(input.taskId, 'implementer', serializeImplementationPackageLog(implementationPackage), 'debug')
  }

  const approverSuffix = input.approvedBy ? ` by ${input.approvedBy}` : ''
  await appendLog(
    input.taskId,
    input.actor,
    `Approved ${input.gateName}${approverSuffix}. ${transition.logMessage}${note ? `: ${note}` : ''}`
  )
}