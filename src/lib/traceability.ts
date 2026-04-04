export interface BranchIssueValidation {
  status: 'valid' | 'missing-branch' | 'missing-issue' | 'mismatch' | 'not-required'
  requiresIssue: boolean
  inferredIssue: string
  message: string
}

export function inferIssueFromBranchName(branchName = ''): string {
  if (!branchName) {
    return ''
  }

  const directMatch = branchName.match(/(?:^|\/)(\d+)(?:-|$)/)
  if (directMatch) {
    return directMatch[1]
  }

  const issueMatch = branchName.match(/(?:^|\/)issue-(\d+)(?:-|$)/i)
  return issueMatch ? issueMatch[1] : ''
}

export function branchRequiresIssue(branchName = ''): boolean {
  return /^(feature|fix|hotfix)\//.test(branchName)
}

export function validateTaskIssueBranchPair(branchName: string | null | undefined, issueNumber: number | null | undefined): BranchIssueValidation {
  const branch = String(branchName || '').trim()
  const issue = issueNumber ? String(issueNumber) : ''

  if (!branch) {
    return {
      status: 'missing-branch',
      requiresIssue: false,
      inferredIssue: '',
      message: 'Task is missing a tracked branch, so implementation traceability cannot be verified.',
    }
  }

  const requiresIssue = branchRequiresIssue(branch)
  const inferredIssue = inferIssueFromBranchName(branch)

  if (!requiresIssue) {
    return {
      status: 'not-required',
      requiresIssue,
      inferredIssue,
      message: 'Branch type does not require an issue-bound implementation guard.',
    }
  }

  if (!issue) {
    return {
      status: 'missing-issue',
      requiresIssue,
      inferredIssue,
      message: `Branch ${branch} requires a linked issue, but the task has no recorded issue number.`,
    }
  }

  if (!inferredIssue) {
    return {
      status: 'mismatch',
      requiresIssue,
      inferredIssue,
      message: `Branch ${branch} requires an inferable issue number before implementation can proceed.`,
    }
  }

  if (inferredIssue !== issue) {
    return {
      status: 'mismatch',
      requiresIssue,
      inferredIssue,
      message: `Branch ${branch} resolves to issue #${inferredIssue}, but the task is linked to issue #${issue}.`,
    }
  }

  return {
    status: 'valid',
    requiresIssue,
    inferredIssue,
    message: `Branch ${branch} correctly resolves to issue #${issue}.`,
  }
}