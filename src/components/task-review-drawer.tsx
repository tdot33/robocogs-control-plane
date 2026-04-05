'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import type { TaskData } from './agent-tasks-table'
import { areGateAnswersComplete, getGatePack, getGateTimelineState } from '@/lib/gates'
import type {
  AuditorReviewPackage,
  ImplementationEvidence,
  ImplementationPackage,
  PlanPackage,
  PromotionPackage,
} from '@/lib/plan-package'

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
  const [implementationEvidence, setImplementationEvidence] = useState<ImplementationEvidence | null>(null)
  const [auditorReviewPackage, setAuditorReviewPackage] = useState<AuditorReviewPackage | null>(null)
  const [promotionPackage, setPromotionPackage] = useState<PromotionPackage | null>(null)
  const [gateAnswers, setGateAnswers] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [implementationEvidenceForm, setImplementationEvidenceForm] = useState({
    prUrl: '',
    headSha: '',
    validationSummary: '',
    scopeSummary: '',
    rollbackNotes: '',
  })
  const [repairAction, setRepairAction] = useState('normalize-task-state')
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
    setImplementationEvidenceForm({
      prUrl: '',
      headSha: '',
      validationSummary: '',
      scopeSummary: '',
      rollbackNotes: '',
    })
    setRepairAction('normalize-task-state')

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
        setImplementationEvidence(data.implementationEvidence || null)
        setAuditorReviewPackage(data.auditorReviewPackage || null)
        setPromotionPackage(data.promotionPackage || null)
      } catch (error) {
        setLogs([])
        setPlanPackage(null)
        setImplementationPackage(null)
        setImplementationEvidence(null)
        setAuditorReviewPackage(null)
        setPromotionPackage(null)
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

  const runRepairAction = async () => {
    try {
      setIsSubmitting(true)
      setErrorMessage('')
      const response = await fetch(`/api/admin/tasks/${task.id}/repair`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: repairAction,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to run repair action')
      }

      router.refresh()
      const refreshed = await fetch(`/api/admin/tasks/${task.id}/logs`, { cache: 'no-store' })
      if (refreshed.ok) {
        const data = await refreshed.json()
        setLogs(Array.isArray(data.logs) ? data.logs : [])
        setPlanPackage(data.planPackage || null)
        setImplementationPackage(data.implementationPackage || null)
        setImplementationEvidence(data.implementationEvidence || null)
        setAuditorReviewPackage(data.auditorReviewPackage || null)
        setPromotionPackage(data.promotionPackage || null)
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to run repair action')
    } finally {
      setIsSubmitting(false)
    }
  }

  const submitImplementationEvidence = async () => {
    try {
      setIsSubmitting(true)
      setErrorMessage('')
      const response = await fetch(`/api/admin/tasks/${task.id}/implementation`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(implementationEvidenceForm),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Failed to submit implementation evidence')
      }

      const payload = await response.json()
      setImplementationEvidence(payload.evidence || null)
      setAuditorReviewPackage(payload.auditorReviewPackage || null)
      router.refresh()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to submit implementation evidence')
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
    'promotion-approval': 'Promotion Approval',
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
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[1px]" onClick={onClose} />
      )}

      <div
        className={`fixed right-0 top-0 z-50 h-full w-full border-l border-[#30363d] bg-[#161b22] shadow-2xl shadow-black/30 transition-transform duration-300 ease-out md:w-96 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between border-b border-[#30363d] p-6">
            <div>
              <h2 className="text-lg font-bold text-white">Review</h2>
              <p className="mt-1 font-mono text-xs text-slate-400">{task.id.slice(0, 12)}...</p>
            </div>
            <button onClick={onClose} className="text-2xl text-slate-500 hover:text-[#c9d1d9]">
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
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

            {implementationEvidence ? (
              <div className="border-b border-[#30363d] p-6">
                <h3 className="mb-3 font-semibold text-white">Implementation Evidence</h3>
                <div className="space-y-3 text-sm text-slate-200">
                  <EvidenceField label="Submitted" value={new Date(implementationEvidence.submittedAt).toLocaleString()} />
                  <EvidenceField label="Branch" value={implementationEvidence.branch || task.branch || '-'} />
                  <EvidenceField label="PR URL" value={implementationEvidence.prUrl || 'Not provided yet'} />
                  <EvidenceField label="Head SHA" value={implementationEvidence.headSha} mono />
                  <EvidenceField label="Validation" value={implementationEvidence.validationSummary} />
                  <EvidenceField label="Scope Summary" value={implementationEvidence.scopeSummary} />
                  <EvidenceField label="Rollback Notes" value={implementationEvidence.rollbackNotes} />
                </div>
              </div>
            ) : null}

            {auditorReviewPackage ? (
              <div className="border-b border-[#30363d] p-6">
                <h3 className="mb-3 font-semibold text-white">Auditor Review Package</h3>
                <p className="text-sm text-slate-300">{auditorReviewPackage.summary}</p>

                <div className="mt-4 space-y-4 text-sm text-slate-200">
                  <PlanList title="Evidence Checklist" items={auditorReviewPackage.evidenceChecklist} />
                  <PlanList title="Review Focus" items={auditorReviewPackage.reviewFocus} />
                  <PlanList title="Merge Criteria" items={auditorReviewPackage.mergeCriteria} />
                  <PlanList title="Closeout Expectations" items={auditorReviewPackage.closeoutExpectations} />
                </div>
              </div>
            ) : null}

            {promotionPackage ? (
              <div className="border-b border-[#30363d] p-6">
                <h3 className="mb-3 font-semibold text-white">Promotion Package</h3>
                <p className="text-sm text-slate-300">{promotionPackage.summary}</p>

                <div className="mt-4 space-y-4 text-sm text-slate-200">
                  <PlanList title="Release Context" items={promotionPackage.releaseContext} />
                  <PlanList title="Founder Checklist" items={promotionPackage.founderChecklist} />
                  <PlanList title="Rollback Expectations" items={promotionPackage.rollbackExpectations} />
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
                        aria-label={question.label}
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

            <div className="border-t border-[#30363d] p-6">
              <h3 className="mb-3 font-semibold text-white">Repair / Backfill</h3>
              <p className="mb-3 text-sm text-slate-400">
                Use these admin-safe actions to rebuild missing packages or normalize a task that predates the current orchestration flow.
              </p>
              <select
                aria-label="Repair action"
                value={repairAction}
                onChange={(event) => setRepairAction(event.target.value)}
                className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-[#c9d1d9] focus:outline-none focus:ring-2 focus:ring-[#1f6feb]"
              >
                <option value="normalize-task-state">Normalize task state</option>
                <option value="regenerate-plan-package">Regenerate plan package</option>
                <option value="regenerate-implementation-package">Regenerate implementation package</option>
                <option value="regenerate-auditor-review-package">Regenerate auditor review package</option>
                <option value="regenerate-promotion-package">Regenerate promotion package</option>
              </select>
              <button
                onClick={() => {
                  if (isSubmitting) return
                  void runRepairAction()
                }}
                className="mt-3 w-full rounded border border-[#8b949e] bg-[#21262d] px-4 py-2 text-sm font-medium text-[#c9d1d9] transition-colors hover:border-white hover:bg-[#30363d] disabled:opacity-50"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Running repair...' : 'Run repair action'}
              </button>
            </div>
          </div>

          <div className="border-t border-[#30363d] bg-[#161b22] p-6">
            {gateName === 'implementation' ? (
              <>
                <p className="mb-4 rounded border border-[#1f6feb]/30 bg-[#111d2e] px-3 py-3 text-sm text-[#79c0ff]">
                  Submit implementation evidence here so the task can hand off to the auditor with a structured review package instead of relying on freeform logs alone.
                </p>
                <ImplementationEvidenceInput
                  label="PR URL (optional)"
                  value={implementationEvidenceForm.prUrl}
                  onChange={(value) => setImplementationEvidenceForm((current) => ({ ...current, prUrl: value }))}
                  placeholder="https://github.com/tdot33/robocogs/pull/123"
                />
                <ImplementationEvidenceInput
                  label="Head SHA"
                  value={implementationEvidenceForm.headSha}
                  onChange={(value) => setImplementationEvidenceForm((current) => ({ ...current, headSha: value }))}
                  placeholder="abc123def456"
                  mono
                />
                <ImplementationEvidenceTextarea
                  label="Validation Summary"
                  value={implementationEvidenceForm.validationSummary}
                  onChange={(value) => setImplementationEvidenceForm((current) => ({ ...current, validationSummary: value }))}
                  placeholder="npm run build passed; targeted validation completed."
                />
                <ImplementationEvidenceTextarea
                  label="Scope Summary"
                  value={implementationEvidenceForm.scopeSummary}
                  onChange={(value) => setImplementationEvidenceForm((current) => ({ ...current, scopeSummary: value }))}
                  placeholder="Describe the exact scope implemented and intentionally untouched areas."
                />
                <ImplementationEvidenceTextarea
                  label="Rollback Notes"
                  value={implementationEvidenceForm.rollbackNotes}
                  onChange={(value) => setImplementationEvidenceForm((current) => ({ ...current, rollbackNotes: value }))}
                  placeholder="Describe the rollback plan if validation or review fails."
                />
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => {
                      if (isSubmitting) return
                      void submitImplementationEvidence()
                    }}
                    className="flex-1 rounded border border-[#1f6feb] bg-[#1f6feb]/15 px-4 py-2 text-sm font-medium text-[#79c0ff] transition-colors hover:bg-[#1f6feb]/25 disabled:opacity-50"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Submitting...' : implementationEvidence ? 'Update evidence' : 'Submit evidence'}
                  </button>
                  <button
                    onClick={onClose}
                    className="flex-1 rounded border border-[#30363d] bg-[#21262d] px-4 py-2 text-sm font-medium text-[#c9d1d9] transition-colors hover:border-[#8b949e] hover:bg-[#30363d] disabled:opacity-50"
                    disabled={isSubmitting}
                  >
                    Close
                  </button>
                </div>
                {implementationEvidence ? (
                  <p className="mt-3 text-xs text-slate-400">
                    Evidence is recorded. The task remains in implementation until CI succeeds, then merge approval opens for founder review.
                  </p>
                ) : null}
              </>
            ) : isDecisionGate ? (
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

function PlanList({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) {
    return null
  }

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

function EvidenceField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</h4>
      <div className={`rounded border border-[#30363d] bg-[#0d1117] px-3 py-2 text-slate-200 ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </div>
    </div>
  )
}

function ImplementationEvidenceInput({
  label,
  value,
  onChange,
  placeholder,
  mono = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  mono?: boolean
}) {
  return (
    <div className="mb-4">
      <label className="mb-2 block text-xs font-semibold uppercase text-slate-400">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-[#c9d1d9] focus:outline-none focus:ring-2 focus:ring-[#1f6feb] ${mono ? 'font-mono text-xs' : ''}`}
        placeholder={placeholder}
      />
    </div>
  )
}

function ImplementationEvidenceTextarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div className="mb-4">
      <label className="mb-2 block text-xs font-semibold uppercase text-slate-400">{label}</label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-[#c9d1d9] focus:outline-none focus:ring-2 focus:ring-[#1f6feb]"
        rows={3}
        placeholder={placeholder}
      />
    </div>
  )
}
