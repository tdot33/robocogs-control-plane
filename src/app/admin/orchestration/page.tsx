import { db } from '@/lib/db'
import { AgentTasksTable } from '@/components/agent-tasks-table'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ADMIN_SESSION_COOKIE, isAdminSessionValid } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Orchestration Dashboard',
  description: 'Agent task orchestration and gate approval interface',
}

export default async function OrchestrationPage() {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get(ADMIN_SESSION_COOKIE)?.value

  if (!isAdminSessionValid(sessionCookie)) {
    redirect('/admin/login?next=/admin/orchestration')
  }

  const tasks = await db.execute('SELECT * FROM agent_tasks ORDER BY created_at DESC LIMIT 50')
  const tasksData = (tasks.rows || []) as any[]

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#0d1117_0%,#0d1117_100%)] px-4 py-8 text-slate-100">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
          <h1 className="mb-2 text-4xl font-bold text-white">Orchestration Control Surface</h1>
          <p className="text-lg text-slate-300">
            Agent task execution, gate approvals, and audit evidence
          </p>
          </div>
          <form method="POST" action="/api/admin/logout">
            <button
              type="submit"
              className="rounded-md border border-[#30363d] bg-[#161b22] px-3 py-2 text-sm font-medium text-[#c9d1d9] hover:border-[#8b949e] hover:bg-[#1c2128]"
            >
              Sign Out
            </button>
          </form>
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
        <div className="overflow-hidden rounded-2xl border border-[#30363d] bg-[#161b22] shadow-[0_16px_40px_rgba(1,4,9,0.35)]">
          <div className="border-b border-[#30363d] px-6 py-4">
            <h2 className="text-xl font-semibold text-white">Active Tasks</h2>
          </div>
          <AgentTasksTable tasks={tasksData} />
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors = {
    blue: 'border-[#30363d] bg-[#161b22] text-[#c9d1d9]',
    amber: 'border-[#5e4429] bg-[#2d210f] text-[#e3b341]',
    green: 'border-[#1f5132] bg-[#12261e] text-[#3fb950]',
    red: 'border-[#6e2f36] bg-[#2d1617] text-[#f85149]',
  }

  return (
    <div className={`${colors[color as keyof typeof colors]} rounded-2xl border p-4`}>
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  )
}
