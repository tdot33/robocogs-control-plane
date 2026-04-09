import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { runBootstrap } from "./worktree-bootstrap.mjs";

function parseArgs(argv) {
  const args = {
    branch: "",
    sessionId: "",
    path: "",
    forceInstall: false,
    skipEnvCheck: false,
    dryRun: false,
  };

  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--branch=")) args.branch = arg.slice("--branch=".length).trim();
    else if (arg.startsWith("--session-id=")) args.sessionId = arg.slice("--session-id=".length).trim();
    else if (arg.startsWith("--path=")) args.path = arg.slice("--path=".length).trim();
    else if (arg === "--force-install") args.forceInstall = true;
    else if (arg === "--skip-env-check") args.skipEnvCheck = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!args.branch) {
    throw new Error("--branch is required");
  }

  return args;
}

function printHelp() {
  console.log(`Usage: npm run worktree:add -- [options]

Options:
  --branch=<name>      Issue branch to spawn a session-scoped worktree branch from
  --session-id=<id>    Stable session id to resume the same worktree branch intentionally
  --path=<dir>         Optional worktree path (default: ../worktrees/<branch-name>-<session>)
  --force-install      Forwarded to worktree:bootstrap
  --skip-env-check     Forwarded to worktree:bootstrap
  --dry-run            Print planned actions without mutating state

Examples:
  npm run worktree:add -- --branch=chore/123-control-plane-task
  npm run worktree:add -- --branch=chore/123-control-plane-task --session-id=copilot-session-abc
  npm run worktree:add -- --branch=fix/urgent-patch --path=../worktrees/control-plane-patch
`);
}

function fingerprint(value, length = 8) {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function sanitizeSegment(value, fallback) {
  return value
    .replace(/[\\/]+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || fallback;
}

export function sanitizeBranchForPath(branchName) {
  const normalized = sanitizeSegment(branchName, "worktree");

  return `${normalized}--${fingerprint(branchName)}`;
}

export function sanitizeSessionForPath(sessionId) {
  const normalized = sanitizeSegment(sessionId, "session");

  return `${normalized}--${fingerprint(sessionId, 6)}`;
}

export function deriveSessionBranchName(branchName, sessionId) {
  return `${branchName}--session-${sanitizeSessionForPath(sessionId)}`;
}

export function defaultWorktreeBase(repoRoot) {
  const parent = path.dirname(repoRoot);
  return path.basename(parent) === "worktrees" ? parent : path.resolve(repoRoot, "..", "worktrees");
}

export function defaultWorktreePath(repoRoot, branchName, sessionId) {
  const branchPath = sanitizeBranchForPath(branchName);
  const worktreeName = sessionId
    ? `${branchPath}--${sanitizeSessionForPath(sessionId)}`
    : branchPath;

  return path.resolve(defaultWorktreeBase(repoRoot), worktreeName);
}

function repoRootFromScript() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function runGit(repoRoot, args, { dryRun = false } = {}) {
  if (dryRun) return;

  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed in ${repoRoot}`);
  }
}

function branchExists(repoRoot, branchName) {
  const result = spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "ignore",
  });

  return result.status === 0;
}

function resolveSessionId(explicitSessionId) {
  const envSessionId = (process.env.ROBOCOGS_WORKTREE_SESSION_ID || "").trim();

  if (explicitSessionId) return explicitSessionId;
  if (envSessionId) return envSessionId;

  return `session-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
}

export async function runWorktreeAdd(argv = process.argv) {
  const args = parseArgs(argv);
  const repoRoot = repoRootFromScript();
  const sessionId = resolveSessionId(args.sessionId);
  const sessionBranch = deriveSessionBranchName(args.branch, sessionId);
  const sessionBranchExists = branchExists(repoRoot, sessionBranch);
  const worktreePath = path.resolve(args.path || defaultWorktreePath(repoRoot, args.branch, sessionId));
  const gitArgs = sessionBranchExists
    ? ["worktree", "add", worktreePath, sessionBranch]
    : ["worktree", "add", "-b", sessionBranch, worktreePath, args.branch];

  console.log(`Worktree add plan for ${args.branch}`);
  console.log(`- Repo root: ${repoRoot}`);
  console.log(`- Session id: ${sessionId}`);
  console.log(`- Session branch: ${sessionBranch}${sessionBranchExists ? " (existing)" : " (new)"}`);
  console.log(`- Worktree path: ${worktreePath}`);

  if (args.dryRun) {
    console.log(`- Git command: git ${gitArgs.join(" ")}`);
    console.log(`- Bootstrap command: npm run worktree:bootstrap -- --path=${worktreePath}`);
    return;
  }

  runGit(repoRoot, gitArgs, { dryRun: args.dryRun });
  await runBootstrap([
    process.execPath,
    fileURLToPath(import.meta.url),
    `--path=${worktreePath}`,
    ...(args.forceInstall ? ["--force-install"] : []),
    ...(args.skipEnvCheck ? ["--skip-env-check"] : []),
    ...(args.dryRun ? ["--dry-run"] : []),
  ]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runWorktreeAdd().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}