import { db } from '@/lib/db'
import { AgentTasksTable } from '@/components/agent-tasks-table'

export const metadata = {
  title: 'Orchestration Dashboard',
  description: 'Agent task orchestration and gate approval interface',
}

export default async function OrchestrationPage() {
  const tasks = await db.execute('SELECT * FROM agent_tasks ORDER BY created_at DESC LIMIT 50')
  const tasksData = (tasks.rows || []) as any[]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Orchestration Control Surface</h1>
          <p className="text-lg text-slate-600">
            Agent task execution, gate approvals, and audit evidence
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Active Tasks"
            value={tasksData.filter((t) => !['complete', 'failed', 'rejected'].includes(t.status)).length}
            color="blue"
          />
          <StatCard
            label="Awaiting Approval"
            value={tasksData.filter((t) => t.status === 'awaiting_approval').length}
            color="amber"
          />
          <StatCard label="Completed" value={tasksData.filter((t) => t.status === 'complete').length} color="green" />
          <StatCard label="Failed" value={tasksData.filter((t) => t.status === 'failed').length} color="red" />
        </div>

        {/* Main Table */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h2 className="text-xl font-semibold text-slate-900">Active Tasks</h2>
          </div>
          <AgentTasksTable tasks={tasksData} />
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors = {
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    green: 'bg-green-50 border-green-200 text-green-900',
    red: 'bg-red-50 border-red-200 text-red-900',
  }

  return (
    <div className={`${colors[color as keyof typeof colors]} border rounded-lg p-4`}>
      <p className="text-sm font-medium opacity-75">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  )
}
