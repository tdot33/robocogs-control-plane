import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SENTINEL_RELATIVE_PATH = path.join("node_modules", ".cache", "robocogs-control-plane", "worktree-bootstrap.json");

function parseArgs(argv) {
  const args = {
    path: "",
    forceInstall: false,
    skipEnvCheck: false,
    dryRun: false,
  };

  for (const arg of argv.slice(2)) {
    if (arg.startsWith("--path=")) args.path = arg.slice("--path=".length).trim();
    else if (arg.startsWith("--worktree=")) args.path = arg.slice("--worktree=".length).trim();
    else if (arg === "--force-install") args.forceInstall = true;
    else if (arg === "--skip-env-check") args.skipEnvCheck = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage: npm run worktree:bootstrap -- [options]

Options:
  --path=<dir>         Target repo/worktree path (default: current directory)
  --force-install      Always run npm ci even when the lockfile sentinel matches
  --skip-env-check     Skip repo-local environment file checks
  --dry-run            Print planned actions without mutating state
`);
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function getCommandInvocation(command, args) {
  if (process.platform === "win32" && /\.cmd$/i.test(command)) {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", formatWindowsCommand(command, args)],
    };
  }

  return { command, args };
}

function formatWindowsCommand(command, args) {
  return [command, ...args].map(quoteWindowsCommandArg).join(" ");
}

function quoteWindowsCommandArg(value) {
  const stringValue = String(value);
  if (!/[\s"&()\[\]{}^=;!'+,`~|<>]/.test(stringValue)) {
    return stringValue;
  }

  return `"${stringValue.replace(/(\\*)"/g, "$1$1\\\"").replace(/(\\+)$/g, "$1$1")}"`;
}

function capture(command, args, { cwd } = {}) {
  const invocation = getCommandInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    const message = result.stderr?.trim() || result.stdout?.trim() || `${command} ${args.join(" ")} failed`;
    throw new Error(message);
  }

  return (result.stdout || "").trim();
}

function run(command, args, { cwd, dryRun = false } = {}) {
  if (dryRun) {
    return;
  }

  const invocation = getCommandInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd,
    encoding: "utf8",
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed in ${cwd}`);
  }
}

async function fileExists(filePath) {
  try {
    await readFile(filePath, "utf8");
    return true;
  } catch {
    return false;
  }
}

async function computeLockHash(repoRoot) {
  const lockPath = path.join(repoRoot, "package-lock.json");
  if (!(await fileExists(lockPath))) {
    throw new Error(`package-lock.json not found at ${repoRoot}`);
  }

  const lockText = await readFile(lockPath, "utf8");
  return createHash("sha256").update(lockText).digest("hex");
}

async function readSentinel(repoRoot) {
  const sentinelPath = path.join(repoRoot, SENTINEL_RELATIVE_PATH);
  if (!(await fileExists(sentinelPath))) {
    return null;
  }

  try {
    return JSON.parse(await readFile(sentinelPath, "utf8"));
  } catch {
    return null;
  }
}

async function writeSentinel(repoRoot, payload, dryRun) {
  if (dryRun) return;

  const sentinelPath = path.join(repoRoot, SENTINEL_RELATIVE_PATH);
  await mkdir(path.dirname(sentinelPath), { recursive: true });
  await writeFile(sentinelPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function getRuntimeFingerprint() {
  return JSON.stringify({
    nodeVersion: process.version,
    npmVersion: capture(npmCommand(), ["--version"]),
  });
}

export async function createBootstrapPlan({ repoRoot, forceInstall = false, skipEnvCheck = false, runtimeFingerprint = getRuntimeFingerprint() }) {
  const normalizedRoot = path.resolve(repoRoot || process.cwd());
  const lockHash = await computeLockHash(normalizedRoot);
  const sentinel = await readSentinel(normalizedRoot);
  const nodeModulesPresent = existsSync(path.join(normalizedRoot, "node_modules"));

  let installNeeded = false;
  let installReason = "up-to-date";
  if (forceInstall) {
    installNeeded = true;
    installReason = "force-install";
  } else if (!nodeModulesPresent) {
    installNeeded = true;
    installReason = "missing-node-modules";
  } else if (!sentinel) {
    installNeeded = true;
    installReason = "missing-sentinel";
  } else if (sentinel.lockHash !== lockHash) {
    installNeeded = true;
    installReason = "lockfile-changed";
  } else if (sentinel.runtimeFingerprint !== runtimeFingerprint) {
    installNeeded = true;
    installReason = "runtime-changed";
  }

  const missingEnvFiles = skipEnvCheck
    ? []
    : [".env.local", ".env"].filter((relativePath) => !existsSync(path.join(normalizedRoot, relativePath)));

  return {
    repoRoot: normalizedRoot,
    install: {
      needed: installNeeded,
      reason: installReason,
      command: npmCommand(),
      args: ["ci", "--prefer-offline"],
      lockHash,
      runtimeFingerprint,
    },
    env: {
      checked: !skipEnvCheck,
      missingFiles: missingEnvFiles,
    },
  };
}

export async function runBootstrap(argv = process.argv) {
  const args = parseArgs(argv);
  const plan = await createBootstrapPlan({
    repoRoot: args.path || process.cwd(),
    forceInstall: args.forceInstall,
    skipEnvCheck: args.skipEnvCheck,
  });

  console.log("Worktree bootstrap plan for robocogs-control-plane");
  console.log(`- Path: ${plan.repoRoot}`);
  console.log(`- Dependencies: ${plan.install.needed ? `run ${plan.install.command} ${plan.install.args.join(" ")} (${plan.install.reason})` : "already up to date"}`);
  if (plan.env.checked) {
    if (plan.env.missingFiles.length === 0) {
      console.log("- Environment files: present");
    } else {
      console.log(`- Environment files: missing ${plan.env.missingFiles.join(", ")}`);
      console.log("  Next step: copy .env.example to .env.local and fill in the required control-plane credentials.");
    }
  }

  if (plan.install.needed) {
    run(plan.install.command, plan.install.args, { cwd: plan.repoRoot, dryRun: args.dryRun });
    await writeSentinel(plan.repoRoot, {
      lockHash: plan.install.lockHash,
      runtimeFingerprint: plan.install.runtimeFingerprint,
      installedAt: new Date().toISOString(),
    }, args.dryRun);
  }

  if (args.dryRun) {
    console.log("- Mode: dry-run (no files or installs changed)");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runBootstrap().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}