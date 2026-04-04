'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import type { TaskData } from './agent-tasks-table'
import { areGateAnswersComplete, getGatePack, getGateTimelineState } from '@/lib/gates'
import type { ImplementationPackage, PlanPackage } from '@/lib/plan-package'

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
  const [planPackage, setPlanPackage] = useState<PlanPackage | null>(null)
  const [implementationPackage, setImplementationPackage] = useState<ImplementationPackage | null>(null)
  const [gateAnswers, setGateAnswers] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [isMounted, setIsMounted] = useState(false)
  const gateName = task.gate_current || 'manual-review'
  const gatePack = getGatePack(gateName)
  const gateTimeline = getGateTimelineState(task.gate_current, task.status)
  const isDecisionGate = Boolean(gatePack)
  const canApprove = isDecisionGate && areGateAnswersComplete(gateName, gateAnswers)

  useEffect(() => {
    setIsMounted(true)

    return () => {
      setIsMounted(false)
    }
  }, [])

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
        setPlanPackage(data.planPackage || null)
        setImplementationPackage(data.implementationPackage || null)
      } catch (error) {
        setLogs([])
        setPlanPackage(null)
        setImplementationPackage(null)
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
    info: 'bg-[#0d1117] text-[#c9d1d9] ring-1 ring-[#30363d]',
    warn: 'bg-[#2d210f] text-[#e3b341] ring-1 ring-[#5e4429]',
    error: 'bg-[#2d1617] text-[#f85149] ring-1 ring-[#6e2f36]',
    debug: 'bg-[#111d2e] text-[#79c0ff] ring-1 ring-[#1f6feb]/25',
  }

  const gateBadgeLabels: Record<string, string> = {
    intake: 'Intake',
    'plan-approval': 'Plan Approval',
    implementation: 'Implementation',
    'merge-approval': 'Merge Approval',
  }

  const gateStateStyles: Record<string, string> = {
    complete: 'bg-[#3fb950]',
    active: 'bg-[#e3b341]',
    blocked: 'bg-[#6e7681]',
  }

  if (!isMounted) {
    return null
  }

  return createPortal(
    <>
      {/* Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[1px]" onClick={onClose} />
      )}

      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-full border-l border-[#30363d] bg-[#161b22] shadow-2xl shadow-black/30 transition-transform duration-300 ease-out md:w-96 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#30363d] p-6">
            <div>
              <h2 className="text-lg font-bold text-white">Review</h2>
              <p className="mt-1 font-mono text-xs text-slate-400">{task.id.slice(0, 12)}...</p>
            </div>
            <button onClick={onClose} className="text-2xl text-slate-500 hover:text-[#c9d1d9]">
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {/* Task Info */}
            <div className="border-b border-[#30363d] p-6">
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
                  <p className="mt-1 rounded bg-[#0d1117] p-2 font-mono text-sm text-[#c9d1d9] ring-1 ring-[#30363d]">{task.branch}</p>
                </div>
              )}
            </div>

            {/* Gate Status */}
            <div className="border-b border-[#30363d] p-6">
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

            {planPackage?.executionPolicy?.length ? (
              <div className="border-b border-[#30363d] p-6">
                <h3 className="mb-3 font-semibold text-white">Execution Policy</h3>
                <PlanList title="Branch And Merge Policy" items={planPackage.executionPolicy} />
              </div>
            ) : null}

            {planPackage ? (
              <div className="border-b border-[#30363d] p-6">
                <h3 className="mb-3 font-semibold text-white">Plan Package</h3>
                <p className="text-sm text-slate-300">{planPackage.summary}</p>

                <div className="mt-4 space-y-4 text-sm text-slate-200">
                  <PlanList title="Objectives" items={planPackage.objectives} />
                  <PlanList title="Execution Policy" items={planPackage.executionPolicy} />
                  <PlanList title="Implementation" items={planPackage.implementationSteps} />
                  <PlanList title="Validation" items={planPackage.validationSteps} />
                  <PlanList title="Rollback" items={planPackage.rollbackSteps} />
                  <PlanList title="Risk Notes" items={planPackage.riskNotes} />
                </div>
              </div>
            ) : null}

            {implementationPackage ? (
              <div className="border-b border-[#30363d] p-6">
                <h3 className="mb-3 font-semibold text-white">Implementation Handoff</h3>
                <p className="text-sm text-slate-300">{implementationPackage.summary}</p>

                <div className="mt-4 space-y-4 text-sm text-slate-200">
                  <PlanList title="Execution Policy" items={implementationPackage.executionPolicy} />
                  <PlanList title="Checklist" items={implementationPackage.implementationChecklist} />
                  <PlanList title="Validation" items={implementationPackage.validationSteps} />
                  <PlanList title="Merge Policy" items={implementationPackage.mergePolicy} />
                  <PlanList title="Risk Notes" items={implementationPackage.riskNotes} />
                </div>
              </div>
            ) : null}

            {gatePack ? (
              <div className="border-b border-[#30363d] p-6">
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
                        className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-[#c9d1d9] focus:outline-none focus:ring-2 focus:ring-[#1f6feb]"
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
          <div className="border-t border-[#30363d] bg-[#161b22] p-6">
            {isDecisionGate ? (
              <>
                <label className="mb-2 block text-xs font-semibold uppercase text-slate-400">Decision Note (optional)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mb-4 w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-[#c9d1d9] focus:outline-none focus:ring-2 focus:ring-[#1f6feb]"
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
                        ? 'border border-[#2ea043] bg-[#238636] text-white hover:bg-[#2ea043]'
                        : 'cursor-not-allowed border border-[#30363d] bg-[#21262d] text-slate-500'
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
                    className="flex-1 rounded border border-[#6e2f36] bg-[#2d1617] px-4 py-2 text-sm font-medium text-[#f85149] transition-colors hover:border-[#f85149] hover:bg-[#3d1d1f] disabled:opacity-50"
                    disabled={isSubmitting}
                  >
                    Reject
                  </button>
                  <button
                    onClick={onClose}
                    className="flex-1 rounded border border-[#30363d] bg-[#21262d] px-4 py-2 text-sm font-medium text-[#c9d1d9] transition-colors hover:border-[#8b949e] hover:bg-[#30363d] disabled:opacity-50"
                    disabled={isSubmitting}
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mb-4 rounded border border-[#1f6feb]/30 bg-[#111d2e] px-3 py-3 text-sm text-[#79c0ff]">
                  Implementation is an execution stage. Push work to the tracked branch, attach validation evidence, and wait for merge approval to open.
                </p>
                <button
                  onClick={onClose}
                  className="w-full rounded border border-[#30363d] bg-[#21262d] px-4 py-2 text-sm font-medium text-[#c9d1d9] transition-colors hover:border-[#8b949e] hover:bg-[#30363d] disabled:opacity-50"
                  disabled={isSubmitting}
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}

function PlanList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h4>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item} className="rounded border border-[#30363d] bg-[#0d1117] px-3 py-2 text-slate-200">
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
