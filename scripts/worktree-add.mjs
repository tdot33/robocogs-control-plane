import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { runBootstrap } from "./worktree-bootstrap.mjs";

function parseArgs(argv) {
  const args = {
    branch: "",
    path: "",
    forceInstall: false,
    skipEnvCheck: false,
    dryRun: false,
  };

  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--branch=")) args.branch = arg.slice("--branch=".length).trim();
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
  --branch=<name>      Existing branch to attach to a new worktree
  --path=<dir>         Optional worktree path (default: ../worktrees/<branch-name>)
  --force-install      Forwarded to worktree:bootstrap
  --skip-env-check     Forwarded to worktree:bootstrap
  --dry-run            Print planned actions without mutating state

Examples:
  npm run worktree:add -- --branch=chore/123-control-plane-task
  npm run worktree:add -- --branch=fix/urgent-patch --path=../worktrees/control-plane-patch
`);
}

export function sanitizeBranchForPath(branchName) {
  const normalized = branchName
    .replace(/[\\/]+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const fingerprint = createHash("sha256").update(branchName).digest("hex").slice(0, 8);

  return `${normalized || "worktree"}--${fingerprint}`;
}

export function defaultWorktreeBase(repoRoot) {
  const parent = path.dirname(repoRoot);
  return path.basename(parent) === "worktrees" ? parent : path.resolve(repoRoot, "..", "worktrees");
}

export function defaultWorktreePath(repoRoot, branchName) {
  return path.resolve(defaultWorktreeBase(repoRoot), sanitizeBranchForPath(branchName));
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

export async function runWorktreeAdd(argv = process.argv) {
  const args = parseArgs(argv);
  const repoRoot = repoRootFromScript();
  const worktreePath = path.resolve(args.path || defaultWorktreePath(repoRoot, args.branch));

  console.log(`Worktree add plan for ${args.branch}`);
  console.log(`- Repo root: ${repoRoot}`);
  console.log(`- Worktree path: ${worktreePath}`);

  if (args.dryRun) {
    console.log(`- Bootstrap command: npm run worktree:bootstrap -- --path=${worktreePath}`);
    return;
  }

  runGit(repoRoot, ["worktree", "add", worktreePath, args.branch], { dryRun: args.dryRun });
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