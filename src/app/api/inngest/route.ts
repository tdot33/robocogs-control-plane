import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { gateProcessor, hardBlockProcessor, gateResponseHandler } from '@/inngest/gate-processor'
import { taskLifecycle, statusUpdateHandler, commitTraceabilityHandler, scopeConflictHandler, prLabeledHandler, ciCheckCompletedHandler } from '@/inngest/task-lifecycle'

// Import all functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    gateProcessor,
    hardBlockProcessor,
    gateResponseHandler,
    taskLifecycle,
    prLabeledHandler,
    statusUpdateHandler,
    ciCheckCompletedHandler,
    commitTraceabilityHandler,
    scopeConflictHandler,
  ],
})
