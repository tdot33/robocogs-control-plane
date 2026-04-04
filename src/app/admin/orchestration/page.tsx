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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.12),_transparent_28%),linear-gradient(180deg,#020617_0%,#0f172a_55%,#111827_100%)] px-4 py-8 text-slate-100">
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
              className="rounded-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm font-medium text-slate-100 shadow-[0_0_0_1px_rgba(255,255,255,0.04)] hover:bg-slate-800"
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
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/75 shadow-[0_24px_80px_rgba(2,6,23,0.45)] backdrop-blur">
          <div className="border-b border-slate-800 px-6 py-4">
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
    blue: 'border-sky-500/30 bg-sky-500/10 text-sky-100',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
    green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
    red: 'border-rose-500/30 bg-rose-500/10 text-rose-100',
  }

  return (
    <div className={`${colors[color as keyof typeof colors]} rounded-2xl border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]`}>
      <p className="text-sm font-medium opacity-80">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  )
}
