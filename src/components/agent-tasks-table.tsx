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
  gate_current: string | null
  created_at: string
  updated_at: string
}

interface AgentTasksTableProps {
  tasks: TaskData[]
}

const statusColors: Record<string, { bg: string; text: string; badge: string }> = {
  pending: { bg: 'bg-[#161b22]', text: 'text-[#c9d1d9]', badge: 'bg-[#21262d] text-[#c9d1d9] ring-1 ring-[#30363d]' },
  running: { bg: 'bg-[#111d2e]', text: 'text-[#79c0ff]', badge: 'bg-[#1f6feb]/15 text-[#79c0ff] ring-1 ring-[#1f6feb]/30' },
  awaiting_approval: { bg: 'bg-[#2d210f]', text: 'text-[#e3b341]', badge: 'bg-[#9e6a03]/15 text-[#e3b341] ring-1 ring-[#9e6a03]/30' },
  approved: { bg: 'bg-[#12261e]', text: 'text-[#3fb950]', badge: 'bg-[#238636]/15 text-[#3fb950] ring-1 ring-[#238636]/30' },
  rejected: { bg: 'bg-[#2d1617]', text: 'text-[#f85149]', badge: 'bg-[#da3633]/15 text-[#f85149] ring-1 ring-[#da3633]/30' },
  failed: { bg: 'bg-[#2d1617]', text: 'text-[#f85149]', badge: 'bg-[#da3633]/15 text-[#f85149] ring-1 ring-[#da3633]/30' },
  complete: { bg: 'bg-[#12261e]', text: 'text-[#3fb950]', badge: 'bg-[#238636]/15 text-[#3fb950] ring-1 ring-[#238636]/30' },
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
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-[#30363d] bg-[#0d1117]">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-300">Task ID</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-300">Task Name</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-300">Agent</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-300">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-300">Progress</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-300">Branch</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-300">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#30363d]">
            {tasks.map((task) => (
              <tr key={task.id} className={`${statusColors[task.status].bg} transition-colors hover:bg-[#1c2128]`}>
                <td className="px-4 py-3 text-xs font-mono text-slate-400">{task.id.slice(0, 8)}...</td>
                <td className="px-4 py-3 font-medium text-white">{task.task_name}</td>
                <td className={`px-4 py-3 ${statusColors[task.status].text}`}>{task.assigned_agent}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${statusColors[task.status].badge}`}>
                    {task.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="h-2 w-full rounded-full bg-[#0d1117]">
                    <div className="h-2 rounded-full bg-[#1f6feb]" style={{ width: `${task.progress}%` }} />
                  </div>
                  <span className="mt-1 block text-xs text-slate-400">{task.progress}%</span>
                </td>
                <td className="px-4 py-3 text-slate-400">{task.branch || '-'}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => openReview(task)}
                    className="rounded border border-[#30363d] bg-[#21262d] px-3 py-1 text-xs font-medium text-[#c9d1d9] transition-colors hover:border-[#8b949e] hover:bg-[#30363d]"
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
      <div className="space-y-3 p-4 md:hidden">
        {tasks.map((task) => (
          <div key={task.id} className={`${statusColors[task.status].bg} rounded-xl border border-[#30363d] p-4`}>
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-semibold text-white">{task.task_name}</h3>
                <p className="mt-1 font-mono text-xs text-slate-400">{task.id.slice(0, 12)}...</p>
              </div>
              <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${statusColors[task.status].badge}`}>
                {task.status.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
              <div>
                <p className="text-xs text-slate-400">Agent</p>
                <p className="font-medium text-white">{task.assigned_agent}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Branch</p>
                <p className="font-medium text-white">{task.branch || '-'}</p>
              </div>
            </div>
            <div className="mb-3">
              <p className="mb-1 text-xs text-slate-400">Progress</p>
              <div className="h-2 w-full rounded-full bg-[#0d1117]">
                <div className="h-2 rounded-full bg-[#1f6feb]" style={{ width: `${task.progress}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-400">{task.progress}%</p>
            </div>
            <button
              onClick={() => openReview(task)}
              className="w-full rounded border border-[#30363d] bg-[#21262d] px-3 py-2 text-sm font-medium text-[#c9d1d9] transition-colors hover:border-[#8b949e] hover:bg-[#30363d]"
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
