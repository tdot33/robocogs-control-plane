import { createClient } from '@libsql/client'

export type AgentRole = 'architect' | 'implementer' | 'auditor' | 'domain-specialist' | 'historian' | 'concierge-router'
export type TaskStatus = 'pending' | 'running' | 'awaiting_approval' | 'approved' | 'rejected' | 'failed' | 'complete'
export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export interface AgentTask {
  id: string
  task_name: string
  assigned_agent: AgentRole
  status: TaskStatus
  progress: number
  branch: string | null
  issue_number: number | null
  scope_slice: string | null
  gate_current: string | null
  created_at: string
  updated_at: string
}

export interface AgentLog {
  id: string
  task_id: string
  agent: string
  message: string
  level: LogLevel
  created_at: string
}

const dbUrl = process.env.TURSO_URL
const dbToken = process.env.TURSO_AUTH_TOKEN

if (!dbUrl || !dbToken) {
  throw new Error('TURSO_URL and TURSO_AUTH_TOKEN environment variables are required')
}

export const db = createClient({
  url: dbUrl,
  authToken: dbToken,
})

export async function getActiveTasks(): Promise<AgentTask[]> {
  const result = await db.execute('SELECT * FROM agent_tasks WHERE status != ? ORDER BY created_at DESC', ['complete'])
  return result.rows as AgentTask[]
}

export async function getTaskById(taskId: string): Promise<AgentTask | null> {
  const result = await db.execute('SELECT * FROM agent_tasks WHERE id = ?', [taskId])
  return (result.rows[0] as AgentTask) || null
}

export async function updateTaskStatus(taskId: string, status: TaskStatus, progress?: number): Promise<void> {
  const query = progress !== undefined 
    ? 'UPDATE agent_tasks SET status = ?, progress = ?, updated_at = datetime(?) WHERE id = ?'
    : 'UPDATE agent_tasks SET status = ?, updated_at = datetime(?) WHERE id = ?'
  
  const params = progress !== undefined 
    ? [status, progress, new Date().toISOString(), taskId]
    : [status, new Date().toISOString(), taskId]
  
  await db.execute(query, params)
}

export async function createTask(task: Omit<AgentTask, 'created_at' | 'updated_at'>): Promise<AgentTask> {
  const now = new Date().toISOString()
  await db.execute(
    `INSERT INTO agent_tasks (id, task_name, assigned_agent, status, progress, branch, issue_number, scope_slice, gate_current, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [task.id, task.task_name, task.assigned_agent, task.status, task.progress, task.branch, task.issue_number, task.scope_slice, task.gate_current, now, now]
  )
  return { ...task, created_at: now, updated_at: now }
}

export async function appendLog(taskId: string, agent: string, message: string, level: LogLevel = 'info'): Promise<void> {
  const id = `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const now = new Date().toISOString()
  await db.execute(
    'INSERT INTO agent_logs (id, task_id, agent, message, level, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, taskId, agent, message, level, now]
  )
}

export async function getTaskLogs(taskId: string): Promise<AgentLog[]> {
  const result = await db.execute('SELECT * FROM agent_logs WHERE task_id = ? ORDER BY created_at DESC LIMIT 100', [taskId])
  return result.rows as AgentLog[]
}
