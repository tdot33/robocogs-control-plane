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
    info: 'bg-slate-900 text-slate-200 ring-1 ring-slate-800',
    warn: 'bg-amber-500/10 text-amber-100 ring-1 ring-amber-500/20',
    error: 'bg-rose-500/10 text-rose-100 ring-1 ring-rose-500/20',
    debug: 'bg-sky-500/10 text-sky-100 ring-1 ring-sky-500/20',
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
        <div className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-[2px]" onClick={onClose} />
      )}

      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-full bg-slate-950 shadow-2xl shadow-black/40 transition-transform duration-300 ease-out md:w-96 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800 p-6">
            <div>
              <h2 className="text-lg font-bold text-white">Review</h2>
              <p className="mt-1 font-mono text-xs text-slate-400">{task.id.slice(0, 12)}...</p>
            </div>
            <button onClick={onClose} className="text-2xl text-slate-500 hover:text-slate-200">
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {/* Task Info */}
            <div className="border-b border-slate-800 p-6">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase text-slate-400">Task</p>
                <p className="mt-1 font-medium text-white">{task.task_name}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-400">Agent</p>
                  <p className="mt-1 font-medium text-white">{task.assigned_agent}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-400">Status</p>
                  <p className="mt-1 font-medium text-white">{task.status}</p>
                </div>
              </div>
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase text-slate-400">Current Gate</p>
                <p className="mt-1 font-medium text-white">{gateName}</p>
              </div>
              {task.branch && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase text-slate-400">Branch</p>
                  <p className="mt-1 rounded bg-slate-900 p-2 font-mono text-sm text-slate-200 ring-1 ring-slate-800">{task.branch}</p>
                </div>
              )}
            </div>

            {/* Gate Status */}
            <div className="border-b border-slate-800 p-6">
              <h3 className="mb-3 font-semibold text-white">Gate Status</h3>
              <div className="space-y-2">
                {Object.entries(gateBadgeLabels).map(([gateKey, label]) => {
                  const gateState = gateTimeline[gateKey]
                  const suffix = gateState === 'complete' ? '✓ Complete' : gateState === 'active' ? '⏳ Active' : '— Blocked'

                  return (
                    <div key={gateKey} className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${gateStateStyles[gateState]}`} />
                      <span className={`text-sm ${gateState === 'blocked' ? 'text-slate-500' : 'text-slate-200'}`}>
                        {label}: {suffix}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {gatePack ? (
              <div className="border-b border-slate-800 p-6">
                <h3 className="mb-3 font-semibold text-white">Gate Questions</h3>
                <div className="space-y-4">
                  {gatePack.questions.map((question) => (
                    <div key={question.id}>
                      <label className="mb-1 block text-sm font-medium text-slate-200">{question.label}</label>
                      <select
                        value={gateAnswers[question.id] || ''}
                        onChange={(event) => {
                          setGateAnswers((current) => ({
                            ...current,
                            [question.id]: event.target.value,
                          }))
                        }}
                        className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-400"
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
              <h3 className="mb-3 font-semibold text-white">Activity Logs</h3>
              {errorMessage ? (
                <div className="mb-3 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
                  {errorMessage}
                </div>
              ) : null}
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {loading ? (
                  <p className="text-sm text-slate-400">Loading logs...</p>
                ) : logs.length === 0 ? (
                  <p className="text-sm italic text-slate-400">No logs yet</p>
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
          <div className="border-t border-slate-800 bg-slate-950 p-6">
            <label className="mb-2 block text-xs font-semibold uppercase text-slate-400">Decision Note (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mb-4 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-400"
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
                    ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                    : 'cursor-not-allowed bg-slate-800 text-slate-500'
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
                className="flex-1 rounded bg-rose-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-400 disabled:opacity-50"
                disabled={isSubmitting}
              >
                Reject
              </button>
              <button
                onClick={onClose}
                className="flex-1 rounded bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-700 disabled:opacity-50"
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
