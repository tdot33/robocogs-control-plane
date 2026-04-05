import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";

import { createBootstrapPlan } from "./worktree-bootstrap.mjs";

const DEFAULT_RUNTIME_FINGERPRINT = JSON.stringify({ nodeVersion: "v22.0.0", npmVersion: "10.0.0" });

async function makeRepoFixture({ withNodeModules = false, withSentinel = false, sentinelContents = null } = {}) {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "robocogs-control-plane-bootstrap-"));
  await writeFile(path.join(repoRoot, "package-lock.json"), "{}\n", "utf8");

  if (withNodeModules) {
    await mkdir(path.join(repoRoot, "node_modules"), { recursive: true });
  }

  if (withSentinel) {
    await mkdir(path.join(repoRoot, "node_modules", ".cache", "robocogs-control-plane"), { recursive: true });
    await writeFile(
      path.join(repoRoot, "node_modules", ".cache", "robocogs-control-plane", "worktree-bootstrap.json"),
      sentinelContents ?? `${JSON.stringify({ lockHash: "44136fa355b3678a1146ad16f7e8649e94fb4fc21fef7b7d4f5fbe3f9a0f2f14", runtimeFingerprint: DEFAULT_RUNTIME_FINGERPRINT }, null, 2)}\n`,
      "utf8",
    );
  }

  return repoRoot;
}

test("createBootstrapPlan installs when node_modules are missing", async (t) => {
  const repoRoot = await makeRepoFixture();
  t.after(async () => rm(repoRoot, { recursive: true, force: true }));
  const plan = await createBootstrapPlan({ repoRoot, runtimeFingerprint: DEFAULT_RUNTIME_FINGERPRINT });
  assert.equal(plan.install.needed, true);
  assert.equal(plan.install.reason, "missing-node-modules");
});

test("createBootstrapPlan reinstalls when sentinel is malformed", async (t) => {
  const repoRoot = await makeRepoFixture({ withNodeModules: true, withSentinel: true, sentinelContents: "{bad-json}\n" });
  t.after(async () => rm(repoRoot, { recursive: true, force: true }));
  const plan = await createBootstrapPlan({ repoRoot, runtimeFingerprint: DEFAULT_RUNTIME_FINGERPRINT });
  assert.equal(plan.install.needed, true);
  assert.equal(plan.install.reason, "missing-sentinel");
});