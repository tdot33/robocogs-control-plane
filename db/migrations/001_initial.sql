-- Initial Turso schema for robocogs-control-plane
-- Orchestration task and log tables

CREATE TABLE IF NOT EXISTS agent_tasks (
  id TEXT PRIMARY KEY,
  task_name TEXT NOT NULL,
  assigned_agent TEXT NOT NULL CHECK(assigned_agent IN ('architect', 'implementer', 'auditor', 'domain-specialist', 'historian', 'concierge-router')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'awaiting_approval', 'approved', 'rejected', 'failed', 'complete')),
  progress INTEGER DEFAULT 0 CHECK(progress >= 0 AND progress <= 100),
  branch TEXT,
  issue_number INTEGER,
  scope_slice TEXT,
  gate_current TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX idx_agent_tasks_assigned_agent ON agent_tasks(assigned_agent);
CREATE INDEX idx_agent_tasks_created_at ON agent_tasks(created_at DESC);

CREATE TABLE IF NOT EXISTS agent_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  agent TEXT NOT NULL,
  message TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info' CHECK(level IN ('info', 'warn', 'error', 'debug')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_agent_logs_task_id ON agent_logs(task_id);
CREATE INDEX idx_agent_logs_created_at ON agent_logs(created_at DESC);
CREATE INDEX idx_agent_logs_level ON agent_logs(level);

-- Gate approval audit trail
CREATE TABLE IF NOT EXISTS gate_approvals (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  gate_name TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  answers TEXT NOT NULL, -- JSON stringified
  approved_at TEXT NOT NULL DEFAULT (datetime('now')),
  comment_url TEXT,
  comment_id INTEGER
);

CREATE INDEX idx_gate_approvals_task_id ON gate_approvals(task_id);
CREATE INDEX idx_gate_approvals_gate_name ON gate_approvals(gate_name);
