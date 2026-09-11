import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { sweepJailDirectories, sweepOrphanedResources } from "./orphan-sweep.js";

describe("orphan-sweep", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sweep-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("removes all orphaned jail directories", () => {
    const fakeJailBase = path.join(tmpDir, "jailer");
    const fcDir = path.join(fakeJailBase, "firecracker");
    fs.mkdirSync(path.join(fcDir, "vm-1"), { recursive: true });
    fs.mkdirSync(path.join(fcDir, "vm-2"), { recursive: true });

    vi.stubEnv("FIRECRACKER_JAIL_BASE", fakeJailBase);

    expect(fs.existsSync(path.join(fcDir, "vm-1"))).toBe(true);
    expect(fs.existsSync(path.join(fcDir, "vm-2"))).toBe(true);

    sweepJailDirectories();

    expect(fs.readdirSync(fcDir)).toEqual([]);
  });
});
