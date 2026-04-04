'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TaskData } from './agent-tasks-table'
import { areGateAnswersComplete, getGatePack, getGateTimelineState } from '@/lib/gates'

interface TaskReviewDrawerProps {
  task: TaskData
  isOpen: boolean
  onClose: () => void
}

interface AgentLog {
  id: string
  task_id: string
  agent: string
  message: string
  level: 'info' | 'warn' | 'error' | 'debug'
  created_at: string
}

export function TaskReviewDrawer({ task, isOpen, onClose }: TaskReviewDrawerProps) {
  const router = useRouter()
  const [logs, setLogs] = useState<AgentLog[]>([])
  const [gateAnswers, setGateAnswers] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const gateName = task.gate_current || 'manual-review'
  const gatePack = getGatePack(gateName)
  const gateTimeline = getGateTimelineState(task.gate_current, task.status)
  const canApprove = areGateAnswersComplete(gateName, gateAnswers)

  useEffect(() => {
    if (!isOpen) return

    setGateAnswers({})
    setNote('')
    setErrorMessage('')

    const fetchLogs = async () => {
      try {
        setLoading(true)
        const response = await fetch(`/api/admin/tasks/${task.id}/logs`, {
          cache: 'no-store',
        })
        if (!response.ok) {
          throw new Error(`Failed to fetch logs (${response.status})`)
        }
        const data = await response.json()
        setLogs(Array.isArray(data.logs) ? data.logs : [])
      } catch (error) {
        setLogs([])
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load logs')
      } finally {
        setLoading(false)
      }
    }

    fetchLogs()
  }, [isOpen, task.id])

  const submitDecision = async (decision: 'approve' | 'reject') => {
    try {
      setIsSubmitting(true)
      setErrorMessage('')
      const response = await fetch(`/api/admin/tasks/${task.id}/decision`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          decision,
          note,
          answers: gateAnswers,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || `Failed to ${decision} task`)
      }

      router.refresh()
      onClose()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to submit decision')
    } finally {
      setIsSubmitting(false)
    }
  }

  const logLevelColors: Record<string, string> = {
    info: 'text-slate-600 bg-slate-50',
    warn: 'text-amber-700 bg-amber-50',
    error: 'text-red-700 bg-red-50',
    debug: 'text-gray-600 bg-gray-50',
  }

  const gateBadgeLabels: Record<string, string> = {
    intake: 'Intake',
    'plan-approval': 'Plan Approval',
    implementation: 'Implementation',
    'merge-approval': 'Merge Approval',
  }

  const gateStateStyles: Record<string, string> = {
    complete: 'bg-green-500',
    active: 'bg-amber-500',
    blocked: 'bg-slate-300',
  }

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      )}

      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 h-full w-full md:w-96 bg-white shadow-2xl transform transition-transform duration-300 ease-out z-50 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-slate-200">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Review</h2>
              <p className="text-xs text-slate-600 font-mono mt-1">{task.id.slice(0, 12)}...</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl">
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {/* Task Info */}
            <div className="p-6 border-b border-slate-200">
              <div className="mb-4">
                <p className="text-xs font-semibold text-slate-600 uppercase">Task</p>
                <p className="font-medium text-slate-900 mt-1">{task.task_name}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase">Agent</p>
                  <p className="font-medium text-slate-900 mt-1">{task.assigned_agent}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase">Status</p>
                  <p className="font-medium text-slate-900 mt-1">{task.status}</p>
                </div>
              </div>
              <div className="mt-4">
                <p className="text-xs font-semibold text-slate-600 uppercase">Current Gate</p>
                <p className="font-medium text-slate-900 mt-1">{gateName}</p>
              </div>
              {task.branch && (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-slate-600 uppercase">Branch</p>
                  <p className="font-mono text-sm text-slate-700 mt-1 bg-slate-50 p-2 rounded">{task.branch}</p>
                </div>
              )}
            </div>

            {/* Gate Status */}
            <div className="p-6 border-b border-slate-200">
              <h3 className="font-semibold text-slate-900 mb-3">Gate Status</h3>
              <div className="space-y-2">
                {Object.entries(gateBadgeLabels).map(([gateKey, label]) => {
                  const gateState = gateTimeline[gateKey]
                  const suffix = gateState === 'complete' ? '✓ Complete' : gateState === 'active' ? '⏳ Active' : '— Blocked'

                  return (
                    <div key={gateKey} className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${gateStateStyles[gateState]}`} />
                      <span className={`text-sm ${gateState === 'blocked' ? 'text-slate-500' : 'text-slate-700'}`}>
                        {label}: {suffix}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {gatePack ? (
              <div className="p-6 border-b border-slate-200">
                <h3 className="font-semibold text-slate-900 mb-3">Gate Questions</h3>
                <div className="space-y-4">
                  {gatePack.questions.map((question) => (
                    <div key={question.id}>
                      <label className="block text-sm font-medium text-slate-700 mb-1">{question.label}</label>
                      <select
                        value={gateAnswers[question.id] || ''}
                        onChange={(event) => {
                          setGateAnswers((current) => ({
                            ...current,
                            [question.id]: event.target.value,
                          }))
                        }}
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
                      >
                        <option value="">Select an answer</option>
                        {question.type === 'yes-no' ? (
                          <>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                          </>
                        ) : (
                          <>
                            <option value="go">Go</option>
                            <option value="hold">Hold</option>
                          </>
                        )}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Logs */}
            <div className="p-6">
              <h3 className="font-semibold text-slate-900 mb-3">Activity Logs</h3>
              {errorMessage ? (
                <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {errorMessage}
                </div>
              ) : null}
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {loading ? (
                  <p className="text-sm text-slate-600">Loading logs...</p>
                ) : logs.length === 0 ? (
                  <p className="text-sm text-slate-600 italic">No logs yet</p>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className={`text-xs p-2 rounded ${logLevelColors[log.level]}`}>
                      <p className="font-mono mb-1">{new Date(log.created_at).toLocaleTimeString()}</p>
                      <p className="opacity-75">{log.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-200 p-6 bg-slate-50">
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-2">Decision Note (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mb-4 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"
              rows={3}
              placeholder="Add context for this approval or rejection"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (!canApprove || isSubmitting) return
                  void submitDecision('approve')
                }}
                className={`flex-1 px-4 py-2 rounded font-medium text-sm transition-colors ${
                  canApprove && !isSubmitting
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-slate-200 text-slate-700 cursor-not-allowed'
                }`}
                disabled={!canApprove || isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : `Approve ${gateName}`}
              </button>
              <button
                onClick={() => {
                  if (isSubmitting) return
                  void submitDecision('reject')
                }}
                className="flex-1 px-4 py-2 rounded font-medium text-sm bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
                disabled={isSubmitting}
              >
                Reject
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 rounded font-medium text-sm bg-slate-200 hover:bg-slate-300 text-slate-900 transition-colors disabled:opacity-50"
                disabled={isSubmitting}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
