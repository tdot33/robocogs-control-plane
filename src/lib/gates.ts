import type { TaskStatus } from './db'

export type GateQuestionType = 'yes-no' | 'single-choice' | 'multi-choice'

export interface GateQuestion {
  id: string
  label: string
  type: GateQuestionType
}

export interface GatePack {
  questions: GateQuestion[]
}

export type GateName = 'intake' | 'plan-approval' | 'implementation' | 'merge-approval' | 'promotion-approval' | 'done' | 'manual-review'

export const GATE_QUESTION_PACKS: Record<string, GatePack> = {
  intake: {
    questions: [
      { id: 'scope-clear', label: 'Scope is clearly defined and achievable?', type: 'yes-no' },
      { id: 'risk-assessed', label: 'Risk posture assessed and acceptable?', type: 'yes-no' },
    ],
  },
  'plan-approval': {
    questions: [
      { id: 'plan-sound', label: 'Proposed implementation plan is sound?', type: 'yes-no' },
      { id: 'testability', label: 'Plan includes testability and validation?', type: 'yes-no' },
      { id: 'rollback-ready', label: 'Rollback strategy defined?', type: 'yes-no' },
    ],
  },
  'merge-approval': {
    questions: [
      { id: 'merge-decision', label: 'Approve merge to chet-dev?', type: 'single-choice' },
      { id: 'evidence-complete', label: 'Evidence package complete?', type: 'yes-no' },
      { id: 'docs-reviewed', label: 'Docs reviewed and updated?', type: 'yes-no' },
      { id: 'rollback-ready', label: 'Rollback procedure ready?', type: 'yes-no' },
    ],
  },
  'promotion-approval': {
    questions: [
      { id: 'promotion-decision', label: 'Promote to master?', type: 'single-choice' },
      { id: 'ci-release-status', label: 'CI release status?', type: 'single-choice' },
      { id: 'risk-posture', label: 'Risk posture?', type: 'single-choice' },
      { id: 'rollback-confirmed', label: 'Confirm rollback ready?', type: 'yes-no' },
    ],
  },
}

export function getGatePack(gateName: string | null | undefined): GatePack | null {
  if (!gateName) {
    return null
  }

  return GATE_QUESTION_PACKS[gateName] || null
}

export function areGateAnswersComplete(gateName: string | null | undefined, answers: Record<string, string>): boolean {
  const pack = getGatePack(gateName)
  if (!pack) {
    return true
  }

  return pack.questions.every((question) => Boolean(answers[question.id]))
}

export interface GateApprovalTransition {
  nextStatus: TaskStatus
  nextProgress: number
  nextGate: string | null
  logMessage: string
}

export function getApprovalTransition(gateName: string | null | undefined): GateApprovalTransition {
  switch (gateName) {
    case 'intake':
      return {
        nextStatus: 'awaiting_approval',
        nextProgress: 25,
        nextGate: 'plan-approval',
        logMessage: 'Intake approved; queued plan approval gate',
      }
    case 'plan-approval':
      return {
        nextStatus: 'running',
        nextProgress: 40,
        nextGate: 'implementation',
        logMessage: 'Plan approved; task moved into implementation',
      }
    case 'merge-approval':
      return {
        nextStatus: 'complete',
        nextProgress: 100,
        nextGate: 'done',
        logMessage: 'Merge approval granted; task completed',
      }
    case 'promotion-approval':
      return {
        nextStatus: 'complete',
        nextProgress: 100,
        nextGate: 'done',
        logMessage: 'Promotion approval granted; task completed',
      }
    default:
      return {
        nextStatus: 'approved',
        nextProgress: 100,
        nextGate: gateName || null,
        logMessage: `Approved gate ${gateName || 'manual-review'}`,
      }
  }
}

export function getGateTimelineState(currentGate: string | null | undefined, status: TaskStatus) {
  const order = ['intake', 'plan-approval', 'implementation', 'merge-approval', 'promotion-approval']

  if (status === 'complete') {
    return Object.fromEntries(order.map((gate) => [gate, 'complete'])) as Record<string, 'complete' | 'active' | 'blocked'>
  }

  const currentIndex = currentGate ? order.indexOf(currentGate) : -1
  return Object.fromEntries(
    order.map((gate, index) => {
      if (currentIndex === -1) {
        return [gate, 'blocked']
      }
      if (index < currentIndex) {
        return [gate, 'complete']
      }
      if (index === currentIndex) {
        return [gate, 'active']
      }
      return [gate, 'blocked']
    })
  ) as Record<string, 'complete' | 'active' | 'blocked'>
}