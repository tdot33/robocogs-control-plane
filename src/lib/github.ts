import crypto from 'crypto'
import { App } from '@octokit/app'
import { Octokit } from '@octokit/rest'

let githubApp: App | null = null

function getGitHubApp() {
  if (githubApp) {
    return githubApp
  }

  const appId = process.env.GITHUB_APP_ID
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY

  if (!appId || !privateKey) {
    throw new Error('GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY environment variables are required')
  }

  const normalizedPrivateKey = crypto
    .createPrivateKey({
      key: privateKey.trim().replace(/\\n/g, '\n').replace(/^"|"$/g, ''),
      format: 'pem',
    })
    .export({
      format: 'pem',
      type: 'pkcs8',
    })
    .toString()

  githubApp = new App({
    appId,
    privateKey: normalizedPrivateKey,
  })

  return githubApp
}

export async function getInstallationClient(installationId: number | string): Promise<Octokit> {
  const installationToken = await getGitHubApp().getInstallationOctokit(Number(installationId))
  return installationToken as unknown as Octokit
}

export async function getRepoInstallationId(owner: string, repo: string): Promise<number> {
  const response = await getGitHubApp().octokit.request('GET /repos/{owner}/{repo}/installation', {
    owner,
    repo,
  })

  return response.data.id
}

export async function dispatchWorkflow(
  installationId: number,
  owner: string,
  repo: string,
  workflowId: string,
  ref: string,
  inputs: Record<string, string> = {}
): Promise<void> {
  const octokit = await getInstallationClient(installationId)
  await octokit.actions.createWorkflowDispatch({
    owner,
    repo,
    workflow_id: workflowId,
    ref,
    inputs,
  })
}

export async function createIssueComment(
  installationId: number,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
): Promise<{ id: number; url: string }> {
  const octokit = await getInstallationClient(installationId)
  const response = await octokit.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  })
  return {
    id: response.data.id,
    url: response.data.html_url,
  }
}

export async function updateIssueComment(
  installationId: number,
  owner: string,
  repo: string,
  commentId: number,
  body: string
): Promise<void> {
  const octokit = await getInstallationClient(installationId)
  await octokit.issues.updateComment({
    owner,
    repo,
    comment_id: commentId,
    body,
  })
}
