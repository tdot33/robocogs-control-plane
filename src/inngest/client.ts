import { Inngest } from 'inngest'

const inngestEventKey = process.env.INNGEST_EVENT_KEY
const inngestSigningKey = process.env.INNGEST_SIGNING_KEY

if (!inngestEventKey) {
  console.warn('INNGEST_EVENT_KEY not set — Inngest will use local mode')
}

export const inngest = new Inngest({
  id: 'robocogs-control-plane',
  ...(inngestEventKey && inngestSigningKey ? { eventKey: inngestEventKey, signingKey: inngestSigningKey } : {}),
})

/**
 * Event types for orchestration
 * These match the envelope format from ORCHESTRATION_V1_EVENT_SCHEMAS.json
 */

export type OrchestrationEvents = {
  'orchestration/task.created': {
    data: {
      taskId: string
      taskName: string
      assignedAgent: string
      branchName: string
      issueNumber?: number
      scopeSlice?: string
      repoOwner: string
      repoName: string
      installationId: number
    }
  }
  'orchestration/task.status_updated': {
    data: {
      taskId: string
      previousStatus: string
      newStatus: string
      progress?: number
      message?: string
    }
  }
  'orchestration/gate.awaiting_approval': {
    data: {
      taskId: string
      gateName: string
      questionPackId: string
      repoOwner: string
      repoName: string
      prNumber?: number
      issueNumber?: number
      installationId: number
    }
  }
  'orchestration/gate.approved': {
    data: {
      taskId: string
      gateName: string
      approvedBy: string
      answers: Record<string, string | boolean>
    }
  }
  'orchestration/gate.hard_blocked': {
    data: {
      taskId: string
      gateName: string
      blockedBy: string
      blockReason: string
      blockedAnswers: Record<string, string | boolean>
    }
  }
  'orchestration/commit.traceability_failure': {
    data: {
      taskId: string
      commitHash: string
      branch: string
      failureMode: string
      details: string
    }
  }
  'orchestration/session.scope_conflict': {
    data: {
      taskId: string
      scopeSlice: string
      conflictingTask: string
      resolution: string
    }
  }
}
