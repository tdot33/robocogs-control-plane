import { stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function parseArgs(argv) {
  const args = {
    mode: "safe",
    mutate: false,
    maxAgeDays: 7,
    verbose: false,
  };

  for (const arg of argv.slice(2)) {
    if (arg === "--safe") args.mode = "safe";
    else if (arg === "--aggressive") args.mode = "aggressive";
    else if (arg === "--for-real") args.mutate = true;
    else if (arg === "--dry-run") args.mutate = false;
    else if (arg.startsWith("--max-age=")) args.maxAgeDays = Number.parseInt(arg.slice("--max-age=".length), 10);
    else if (arg === "--verbose") args.verbose = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!Number.isFinite(args.maxAgeDays) || args.maxAgeDays < 0) {
    throw new Error("--max-age must be a non-negative integer");
  }

  return args;
}

function printHelp() {
  console.log(`Usage: npm run worktree:cleanup -- [options]

Options:
  --safe              Only delete merged + stale worktrees (default)
  --aggressive        Delete stale + orphaned worktrees (merge ignored)
  --for-real          Actually delete worktrees (default is dry-run)
  --dry-run           Preview what would be deleted (default)
  --max-age=<days>    Stale threshold in days (default: 7)
  --verbose           Show detailed reasoning for each worktree

Modes:
  Safe (default):     Orphaned worktrees + stale (7d) merged worktrees
  Aggressive:         Orphaned worktrees + any stale (7d) worktree

Examples:
  npm run worktree:cleanup -- --dry-run
  npm run worktree:cleanup -- --safe --for-real
  npm run worktree:cleanup -- --aggressive --for-real --verbose
`);
}

function repoRootFromScript() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function runGitResult(repoRoot, args, { throwOnError = true } = {}) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (throwOnError && result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }

  return {
    status: result.status,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

function runGit(repoRoot, args) {
  return runGitResult(repoRoot, args, { throwOnError: true }).stdout;
}

/**
 * Parse `git worktree list --porcelain` output into structured records
 * Format (multi-line per worktree):
 *   worktree <path>
 *   HEAD <commit>
 *   branch <ref> [detached] [prunable]
 */
export function parseWorktreeList(output, repoRoot) {
  const lines = output.split("\n");
  const worktrees = [];
  let current = null;

  for (const line of lines) {
    if (!line.trim()) continue;

    if (line.startsWith("worktree ")) {
      // Start of new worktree entry
      if (current && current.path) {
        worktrees.push(current);
      }
      const path = line.slice("worktree ".length);
      current = {
        path,
        commit: null,
        branch: null,
        isDetached: false,
        isPrunable: false,
      };
    } else if (line.startsWith("HEAD ")) {
      if (current) {
        current.commit = line.slice("HEAD ".length);
      }
    } else if (line.startsWith("branch ")) {
      if (current) {
        const ref = line.slice("branch ".length);
        // Parse: refs/heads/branch-name or "detached" or "detached prunable"
        if (ref.startsWith("refs/heads/")) {
          current.branch = ref.slice("refs/heads/".length);
          current.isDetached = false;
        } else if (ref.includes("detached")) {
          current.isDetached = true;
        }
        if (ref.includes("prunable")) {
          current.isPrunable = true;
        }
      }
    } else if (line.startsWith("detached")) {
      if (current) {
        current.isDetached = true;
        if (line.includes("prunable")) {
          current.isPrunable = true;
        }
      }
    }
  }

  // Don't forget the last one
  if (current && current.path) {
    worktrees.push(current);
  }

  // Skip the main repo checkout
  return worktrees.filter((wt) => path.resolve(wt.path) !== path.resolve(repoRoot));
}

/**
 * Detect repo type from worktree path or package.json
 */
async function detectRepoType(worktreePath) {
  try {
    const packageJsonPath = path.join(worktreePath, "package.json");
    const packageJson = JSON.parse(
      await (await import("node:fs/promises")).readFile(packageJsonPath, "utf8")
    );
    const repoName = packageJson.name;

    if (repoName === "robocogs") return "robocogs";
    if (repoName === "robocogs-control-plane") return "robocogs-control-plane";
  } catch {
    // Fall back to path heuristics
  }

  // Heuristic: look at path components
  if (worktreePath.includes("robocogs-control-plane")) return "robocogs-control-plane";
  if (worktreePath.includes("robocogs")) return "robocogs";

  return "unknown";
}

/**
 * Calculate age of worktree in days (time since last access)
 */
async function calculateWorktreeAge(worktreePath) {
  try {
    const stats = await stat(worktreePath);
    const ageMs = Date.now() - stats.mtimeMs;
    return Math.floor(ageMs / (1000 * 60 * 60 * 24));
  } catch {
    return -1; // Unknown age
  }
}

/**
 * Pick candidate merge targets that commonly act as integration branches.
 */
function getMergeTargets(repoRoot) {
  const preferred = ["chet-dev", "master", "main"];
  return preferred.filter((target) => runGitResult(repoRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${target}`], { throwOnError: false }).status === 0);
}

/**
 * Check whether a branch is merged into any target integration branch.
 */
export function isBranchMerged(repoRoot, branchName, mergeTargets = []) {
  if (!branchName || mergeTargets.length === 0) return false;

  for (const target of mergeTargets) {
    const result = runGitResult(repoRoot, ["merge-base", "--is-ancestor", branchName, target], { throwOnError: false });
    if (result.status === 0) {
      return true;
    }
  }

  return false;
}

/**
 * Check if worktree has uncommitted changes
 */
function hasUncommittedChanges(worktreePath) {
  try {
    const output = spawnSync("git", ["status", "--porcelain"], {
      cwd: worktreePath,
      encoding: "utf8",
      stdio: "pipe",
    }).stdout;

    return (output || "").trim().length > 0;
  } catch {
    return true; // Assume dirty if we can't check
  }
}

/**
 * For robocogs: reverse-engineer session branch from worktree path
 * Path format: .../worktrees/<normalized-branch>--<branch-hash>--<session-id>--<session-hash>
 */
async function assessWorktree(wtRecord, repoRoot, mergeTargets) {
  const { path: worktreePath, branch, isDetached } = wtRecord;

  const repoType = await detectRepoType(worktreePath);
  const age = await calculateWorktreeAge(worktreePath);
  const hasChanges = hasUncommittedChanges(worktreePath);

  let merged = null;
  let sessionBranch = null;

  if (branch && !isDetached) {
    merged = isBranchMerged(repoRoot, branch, mergeTargets);
    sessionBranch = repoType === "robocogs" && branch.includes("--session-") ? branch : null;
  }

  return {
    ...wtRecord,
    repo: repoType,
    age,
    merged,
    hasUncommittedChanges: hasChanges,
    sessionBranch,
  };
}

/**
 * Determine if a worktree should be cleaned up
 */
export function shouldCleanup(assessed, mode, maxAgeDays) {
  const { age, merged, isDetached, hasUncommittedChanges, branch } = assessed;

  // Never touch worktrees with uncommitted changes
  if (hasUncommittedChanges) {
    return { eligible: false, reason: "has uncommitted changes" };
  }

  // Always clean orphaned (detached) worktrees
  if (isDetached) {
    return { eligible: true, reason: "detached (orphaned worktree)" };
  }

  // Never clean if no branch info
  if (!branch) {
    return { eligible: false, reason: "branch info unavailable" };
  }

  // Check age
  const isStale = age >= maxAgeDays && age >= 0;

  if (mode === "safe") {
    // Safe: only stale + merged
    if (isStale && merged) {
      return { eligible: true, reason: `stale (${age}d) and merged` };
    }
    return { eligible: false, reason: isStale ? `stale (${age}d) but not merged` : `recent (${age}d)` };
  }

  if (mode === "aggressive") {
    // Aggressive: just stale (merge status ignored)
    if (isStale) {
      return { eligible: true, reason: `stale (${age}d)` };
    }
    return { eligible: false, reason: `recent (${age}d)` };
  }

  return { eligible: false, reason: "unknown mode" };
}

/**
 * Execute cleanup of a worktree (delete dir + session branch if applicable)
 */
function executeCleanup(assessed, repoRoot, dryRun) {
  const { path: worktreePath, sessionBranch, repo } = assessed;

  const errors = [];

  // Try to remove worktree
  try {
    if (!dryRun) {
      const result = runGitResult(repoRoot, ["worktree", "remove", worktreePath, "--force"], { throwOnError: false });
      if (result.status !== 0) {
        errors.push(`Failed to remove worktree: ${result.stderr || result.stdout || "unknown error"}`);
        return { success: false, errors };
      }
    }
  } catch (e) {
    errors.push(`Failed to remove worktree: ${e.message}`);
    return { success: false, errors };
  }

  // Try to remove session branch (robocogs only)
  if (sessionBranch && repo === "robocogs") {
    try {
      if (!dryRun) {
        const result = runGitResult(repoRoot, ["branch", "-D", sessionBranch], { throwOnError: false });
        if (result.status !== 0) {
          errors.push(`Failed to remove session branch '${sessionBranch}': ${result.stderr || result.stdout || "unknown error"}`);
        }
      }
    } catch (e) {
      errors.push(`Failed to remove session branch '${sessionBranch}': ${e.message}`);
    }
  }

  return { success: true, errors };
}

/**
 * Main cleanup orchestration
 */
export async function runWorktreeCleanup(argv = process.argv) {
  const args = parseArgs(argv);
  const repoRoot = repoRootFromScript();
  const mergeTargets = getMergeTargets(repoRoot);

  const report = {
    mode: args.mode,
    dryRun: !args.mutate,
    timestamp: new Date().toISOString(),
    summary: {
      evaluated: 0,
      eligible: 0,
      would_clean: 0,
      cleaned: 0,
      skipped: 0,
      failed: 0,
    },
    worktrees: [],
    errors: [],
  };

  try {
    // List all worktrees
    const wtOutput = runGit(repoRoot, ["worktree", "list", "--porcelain"]);
    const worktrees = parseWorktreeList(wtOutput, repoRoot);

    report.summary.evaluated = worktrees.length;

    // Assess each worktree
    for (const wtRecord of worktrees) {
      const assessed = await assessWorktree(wtRecord, repoRoot, mergeTargets);
      const decision = shouldCleanup(assessed, args.mode, args.maxAgeDays);

      const entry = {
        path: assessed.path,
        repo: assessed.repo,
        branch: assessed.branch,
        sessionBranch: assessed.sessionBranch || null,
        age_days: assessed.age,
        merged: assessed.merged,
        uncommitted: assessed.hasUncommittedChanges,
        status: decision.eligible ? "eligible" : "skipped",
        reason: decision.reason,
      };

      if (decision.eligible) {
        report.summary.eligible += 1;

        if (!args.mutate) {
          report.summary.would_clean += 1;
          entry.status = "would-clean";
        } else {
          const cleanupResult = executeCleanup(assessed, repoRoot, false);

          if (cleanupResult.success) {
            report.summary.cleaned += 1;
            entry.status = "cleaned";
          } else {
            report.summary.failed += 1;
            entry.status = "failed";
            entry.errors = cleanupResult.errors;
            report.errors.push(`${assessed.path}: ${cleanupResult.errors.join("; ")}`);
          }
        }
      } else {
        report.summary.skipped += 1;
      }

      if (args.verbose || decision.eligible) {
        report.worktrees.push(entry);
      }
    }
  } catch (error) {
    report.errors.push(error.message);
    report.summary.failed += 1;
  }

  return report;
}

// CLI entry point
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runWorktreeCleanup()
    .then((report) => {
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = report.errors.length > 0 ? 1 : 0;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
