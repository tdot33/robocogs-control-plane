export interface BranchIssueValidation {
  status: 'valid' | 'missing-branch' | 'missing-issue' | 'mismatch' | 'not-required'
  requiresIssue: boolean
  inferredIssue: string
  message: string
}

export function parseIssueNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return ''
  }

  const trimmed = String(value).trim()
  if (!trimmed) {
    return ''
  }

  const direct = trimmed.match(/^#?(\d+)$/)
  if (direct) {
    return direct[1]
  }

  const fromUrl = trimmed.match(/\/issues\/(\d+)/i)
  return fromUrl ? fromUrl[1] : ''
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

export function getBranchType(branchName = ''): string {
  const match = branchName.match(/^(feature|fix|hotfix|docs|chore)\//)
  return match ? match[1] : ''
}

export function branchRequiresIssue(branchName = ''): boolean {
  return /^(feature|fix|hotfix)\//.test(branchName)
}

export function resolveCanonicalIssue(input: { branchName?: string | null; explicitIssue?: string | number | null } = {}): string {
  return parseIssueNumber(input.explicitIssue) || inferIssueFromBranchName(input.branchName || '')
}

export function validateTaskIssueBranchPair(branchName: string | null | undefined, issueNumber: number | null | undefined): BranchIssueValidation {
  const branch = String(branchName || '').trim()
  const explicitIssue = parseIssueNumber(issueNumber)

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
      message: `Branch ${branch} is a ${getBranchType(branch) || 'non-work'} branch and does not require an issue-bound implementation guard.`,
    }
  }

  if (!explicitIssue) {
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
      message: `Branch ${branch} requires an inferable canonical issue before implementation can proceed.`,
    }
  }

  const canonicalIssue = resolveCanonicalIssue({ branchName: branch, explicitIssue })
  if (canonicalIssue !== explicitIssue || inferredIssue !== explicitIssue) {
    return {
      status: 'mismatch',
      requiresIssue,
      inferredIssue,
      message: `Branch ${branch} resolves to issue #${inferredIssue}, but the task is linked to issue #${explicitIssue}.`,
    }
  }

  return {
    status: 'valid',
    requiresIssue,
    inferredIssue,
    message: `Branch ${branch} correctly resolves to issue #${explicitIssue}.`,
  }
}