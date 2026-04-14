import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  defaultWorktreeBase,
  defaultWorktreePath,
  deriveSessionBranchName,
  sanitizeBranchForPath,
  sanitizeSessionForPath,
} from "./worktree-add.mjs";

test("sanitizeBranchForPath flattens branch separators and reserved characters", () => {
  assert.match(sanitizeBranchForPath("chore/123 control-plane"), /^chore-123-control-plane--[0-9a-f]{8}$/);
  assert.match(sanitizeBranchForPath("fix\\urgent:patch"), /^fix-urgent-patch--[0-9a-f]{8}$/);
});

test("sanitizeBranchForPath keeps distinct branch names on distinct default paths", () => {
  assert.notEqual(sanitizeBranchForPath("feature/foo"), sanitizeBranchForPath("feature-foo"));
});

test("sanitizeSessionForPath keeps distinct session ids on distinct worktree suffixes", () => {
  assert.notEqual(sanitizeSessionForPath("copilot/session-a"), sanitizeSessionForPath("copilot-session-a"));
});

test("deriveSessionBranchName creates a session-specific branch off the issue branch", () => {
  assert.match(
    deriveSessionBranchName("chore/123-control-plane", "copilot-session-abc"),
    /^chore\/123-control-plane--session-copilot-session-abc--[0-9a-f]{6}$/,
  );
});

test("defaultWorktreePath places worktrees beside the repo root", () => {
  const repoRoot = path.resolve("C:/repo/robocogs-control-plane");
  assert.equal(
    defaultWorktreePath(repoRoot, "chore/123-control-plane", "copilot-session-abc"),
    path.resolve(
      "C:/repo/worktrees",
      `${sanitizeBranchForPath("chore/123-control-plane")}--${sanitizeSessionForPath("copilot-session-abc")}`,
    ),
  );
});

test("defaultWorktreeBase reuses the existing worktrees parent when called from a linked worktree", () => {
  const repoRoot = path.resolve("C:/repo/worktrees/control-plane-bootstrap");
  assert.equal(defaultWorktreeBase(repoRoot), path.resolve("C:/repo/worktrees"));
});