import { createClient, type InValue } from '@libsql/client'

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

export interface GateApproval {
  id: string
  task_id: string
  gate_name: string
  approved_by: string
  answers: string
  approved_at: string
  comment_url: string | null
  comment_id: number | null
}

interface GateApprovalRow extends Omit<GateApproval, 'answers'> {
  answers: string
}

let dbClient: ReturnType<typeof createClient> | null = null

function getDbClient() {
  if (dbClient) {
    return dbClient
  }

  const dbUrl = process.env.TURSO_URL
  const dbToken = process.env.TURSO_AUTH_TOKEN

  if (!dbUrl || !dbToken) {
    throw new Error('TURSO_URL and TURSO_AUTH_TOKEN environment variables are required')
  }

  dbClient = createClient({
    url: dbUrl,
    authToken: dbToken,
  })

  return dbClient
}

export const db = {
  execute: (sql: string, args?: InValue[]) =>
    getDbClient().execute(args ? { sql, args } : sql),
}

export async function getActiveTasks(): Promise<AgentTask[]> {
  const result = await db.execute('SELECT * FROM agent_tasks WHERE status != ? ORDER BY created_at DESC', ['complete'])
  return result.rows as unknown as AgentTask[]
}

export async function getTaskById(taskId: string): Promise<AgentTask | null> {
  const result = await db.execute('SELECT * FROM agent_tasks WHERE id = ?', [taskId])
  return (result.rows[0] as unknown as AgentTask) || null
}

export async function getTaskByIssueNumber(issueNumber: number): Promise<AgentTask | null> {
  const result = await db.execute('SELECT * FROM agent_tasks WHERE issue_number = ? ORDER BY created_at DESC LIMIT 1', [issueNumber])
  return (result.rows[0] as unknown as AgentTask) || null
}

export async function getTaskByBranch(branch: string): Promise<AgentTask | null> {
  const result = await db.execute('SELECT * FROM agent_tasks WHERE branch = ? ORDER BY created_at DESC LIMIT 1', [branch])
  return (result.rows[0] as unknown as AgentTask) || null
}

export async function getInFlightTaskCount(): Promise<number> {
  const result = await db.execute(
    'SELECT COUNT(*) AS count FROM agent_tasks WHERE status NOT IN (?, ?, ?)',
    ['complete', 'rejected', 'failed']
  )

  const row = result.rows[0] as { count?: number | string } | undefined
  return Number(row?.count || 0)
}

export async function getInFlightTaskByScopeSlice(scopeSlice: string): Promise<AgentTask | null> {
  const result = await db.execute(
    'SELECT * FROM agent_tasks WHERE scope_slice = ? AND status NOT IN (?, ?, ?) ORDER BY created_at DESC LIMIT 1',
    [scopeSlice, 'complete', 'rejected', 'failed']
  )

  return (result.rows[0] as unknown as AgentTask) || null
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

export async function setTaskGate(taskId: string, gateName: string | null): Promise<void> {
  await db.execute(
    'UPDATE agent_tasks SET gate_current = ?, updated_at = datetime(?) WHERE id = ?',
    [gateName, new Date().toISOString(), taskId]
  )
}

export async function setTaskAgent(taskId: string, assignedAgent: AgentRole): Promise<void> {
  await db.execute(
    'UPDATE agent_tasks SET assigned_agent = ?, updated_at = datetime(?) WHERE id = ?',
    [assignedAgent, new Date().toISOString(), taskId]
  )
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
  return result.rows as unknown as AgentLog[]
}

export async function createGateApproval(input: {
  taskId: string
  gateName: string
  approvedBy: string
  answers: Record<string, string | boolean>
  commentUrl?: string
  commentId?: number
}): Promise<GateApproval> {
  const id = `approval_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  const approvedAt = new Date().toISOString()
  const answers = JSON.stringify(input.answers)

  await db.execute(
    'INSERT INTO gate_approvals (id, task_id, gate_name, approved_by, answers, approved_at, comment_url, comment_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      id,
      input.taskId,
      input.gateName,
      input.approvedBy,
      answers,
      approvedAt,
      input.commentUrl || null,
      input.commentId || null,
    ]
  )

  return {
    id,
    task_id: input.taskId,
    gate_name: input.gateName,
    approved_by: input.approvedBy,
    answers,
    approved_at: approvedAt,
    comment_url: input.commentUrl || null,
    comment_id: input.commentId || null,
  }
}

export async function getLatestGateApproval(taskId: string, gateName: string): Promise<GateApproval | null> {
  const result = await db.execute(
    'SELECT * FROM gate_approvals WHERE task_id = ? AND gate_name = ? ORDER BY approved_at DESC LIMIT 1',
    [taskId, gateName]
  )

  const row = (result.rows[0] as unknown as GateApprovalRow) || null
  if (!row) {
    return null
  }

  return row
}
