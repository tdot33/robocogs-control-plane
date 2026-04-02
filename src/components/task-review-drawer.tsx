'use client'

import { useEffect, useState } from 'react'
import { db } from '@/lib/db'
import type { TaskData } from './agent-tasks-table'

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
  const [logs, setLogs] = useState<AgentLog[]>([])
  const [isApproved, setIsApproved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isOpen) return

    const fetchLogs = async () => {
      try {
        setLoading(true)
        // In real implementation, this would fetch from API
        // const response = await fetch(`/api/tasks/${task.id}/logs`)
        // const data = await response.json()
        // setLogs(data)
        setLogs([]) // Placeholder
      } finally {
        setLoading(false)
      }
    }

    fetchLogs()
  }, [isOpen, task.id])

  const logLevelColors: Record<string, string> = {
    info: 'text-slate-600 bg-slate-50',
    warn: 'text-amber-700 bg-amber-50',
    error: 'text-red-700 bg-red-50',
    debug: 'text-gray-600 bg-gray-50',
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
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span className="text-sm text-slate-700">Intake: ✓ Passing</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <span className="text-sm text-slate-700">Plan Approval: ⏳ Pending</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-slate-300" />
                  <span className="text-sm text-slate-500">Merge Approval: — Blocked</span>
                </div>
              </div>
            </div>

            {/* Logs */}
            <div className="p-6">
              <h3 className="font-semibold text-slate-900 mb-3">Activity Logs</h3>
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
            <label className="flex items-center gap-3 cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={isApproved}
                onChange={(e) => setIsApproved(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300"
              />
              <span className="text-sm font-medium text-slate-900">Approve Implementation</span>
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (isApproved) {
                    // Submit approval
                    console.log('Approved:', task.id)
                  }
                  onClose()
                }}
                className={`flex-1 px-4 py-2 rounded font-medium text-sm transition-colors ${
                  isApproved
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-slate-200 text-slate-700 cursor-not-allowed'
                }`}
                disabled={!isApproved}
              >
                Approve
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 rounded font-medium text-sm bg-slate-200 hover:bg-slate-300 text-slate-900 transition-colors"
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
