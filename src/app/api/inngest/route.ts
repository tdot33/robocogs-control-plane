import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { gateProcessor, hardBlockProcessor } from '@/inngest/gate-processor'
import { taskLifecycle, statusUpdateHandler, commitTraceabilityHandler, scopeConflictHandler } from '@/inngest/task-lifecycle'

// Import all functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    gateProcessor,
    hardBlockProcessor,
    taskLifecycle,
    statusUpdateHandler,
    commitTraceabilityHandler,
    scopeConflictHandler,
  ],
})
