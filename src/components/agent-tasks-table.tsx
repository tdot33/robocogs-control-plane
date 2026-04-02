'use client'

import { useState } from 'react'
import { TaskReviewDrawer } from './task-review-drawer'

export interface TaskData {
  id: string
  task_name: string
  assigned_agent: string
  status: 'pending' | 'running' | 'awaiting_approval' | 'approved' | 'rejected' | 'failed' | 'complete'
  progress: number
  branch: string | null
  issue_number: number | null
  created_at: string
  updated_at: string
}

interface AgentTasksTableProps {
  tasks: TaskData[]
}

const statusColors: Record<string, { bg: string; text: string; badge: string }> = {
  pending: { bg: 'bg-slate-50', text: 'text-slate-700', badge: 'bg-slate-200 text-slate-800' },
  running: { bg: 'bg-blue-50', text: 'text-blue-700', badge: 'bg-blue-200 text-blue-800' },
  awaiting_approval: { bg: 'bg-amber-50', text: 'text-amber-700', badge: 'bg-amber-200 text-amber-800' },
  approved: { bg: 'bg-green-50', text: 'text-green-700', badge: 'bg-green-200 text-green-800' },
  rejected: { bg: 'bg-red-50', text: 'text-red-700', badge: 'bg-red-200 text-red-800' },
  failed: { bg: 'bg-red-50', text: 'text-red-700', badge: 'bg-red-200 text-red-800' },
  complete: { bg: 'bg-emerald-50', text: 'text-emerald-700', badge: 'bg-emerald-200 text-emerald-800' },
}

export function AgentTasksTable({ tasks }: AgentTasksTableProps) {
  const [selectedTask, setSelectedTask] = useState<TaskData | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  const openReview = (task: TaskData) => {
    setSelectedTask(task)
    setIsDrawerOpen(true)
  }

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Task ID</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Task Name</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Agent</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Progress</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-700">Branch</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-700">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {tasks.map((task) => (
              <tr key={task.id} className={`${statusColors[task.status].bg} hover:bg-slate-100 transition-colors`}>
                <td className="px-4 py-3 text-xs font-mono text-slate-600">{task.id.slice(0, 8)}...</td>
                <td className="px-4 py-3 font-medium text-slate-900">{task.task_name}</td>
                <td className="px-4 py-3 text-slate-700">{task.assigned_agent}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${statusColors[task.status].badge}`}>
                    {task.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${task.progress}%` }} />
                  </div>
                  <span className="text-xs text-slate-600 mt-1 block">{task.progress}%</span>
                </td>
                <td className="px-4 py-3 text-slate-600">{task.branch || '-'}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => openReview(task)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-medium transition-colors"
                  >
                    Review
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3 p-4">
        {tasks.map((task) => (
          <div key={task.id} className={`${statusColors[task.status].bg} rounded-lg p-4 border border-slate-200`}>
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-semibold text-slate-900">{task.task_name}</h3>
                <p className="text-xs text-slate-600 font-mono mt-1">{task.id.slice(0, 12)}...</p>
              </div>
              <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${statusColors[task.status].badge}`}>
                {task.status.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
              <div>
                <p className="text-xs text-slate-600">Agent</p>
                <p className="font-medium text-slate-900">{task.assigned_agent}</p>
              </div>
              <div>
                <p className="text-xs text-slate-600">Branch</p>
                <p className="font-medium text-slate-900">{task.branch || '-'}</p>
              </div>
            </div>
            <div className="mb-3">
              <p className="text-xs text-slate-600 mb-1">Progress</p>
              <div className="w-full bg-slate-300 rounded-full h-2">
                <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${task.progress}%` }} />
              </div>
              <p className="text-xs text-slate-600 mt-1">{task.progress}%</p>
            </div>
            <button
              onClick={() => openReview(task)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm font-medium transition-colors"
            >
              Review Implementation
            </button>
          </div>
        ))}
      </div>

      {/* Review Drawer */}
      {selectedTask && (
        <TaskReviewDrawer task={selectedTask} isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
      )}
    </>
  )
}
