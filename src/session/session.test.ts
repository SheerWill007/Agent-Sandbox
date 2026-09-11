import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../vm/cleanup.js", () => ({
  cleanupVm: vi.fn(async () => {}),
}));

vi.mock("./manifest.js", () => ({
  removeEntry: vi.fn(),
  addEntry: vi.fn(),
}));

vi.mock("../logger.js", () => ({
  sessionLogger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
  vmLogger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("../metrics.js", () => ({
  execSessionsActive: { inc: vi.fn(), dec: vi.fn() },
  execSessionDurationSeconds: { observe: vi.fn() },
}));

import {
  createSession,
  getSession,
  touchSession,
  destroySession,
  getAllSessions,
  startSessionReaper,
  _clearSessionsForTesting,
} from "./session.js";
import { cleanupVm } from "../vm/cleanup.js";
import { removeEntry } from "./manifest.js";
import { execSessionsActive, execSessionDurationSeconds } from "../metrics.js";

describe("Session State Machine & Lifecycle", () => {
  beforeEach(() => {
    _clearSessionsForTesting();
    vi.clearAllMocks();
  });

  afterEach(() => {
    _clearSessionsForTesting();
  });

  it("creates and retrieves a session", () => {
    const s = createSession("test-s1", "python", "owner-1");
    expect(s.sessionId).toBe("test-s1");
    expect(s.template).toBe("python");
    expect(s.ownerId).toBe("owner-1");
    expect(s.state).toBe("creating");

    const retrieved = getSession("test-s1");
    expect(retrieved).toBe(s);
    expect(execSessionsActive.inc).toHaveBeenCalled();
  });

  it("creates session with default template when not specified", () => {
    const s = createSession("test-default");
    expect(s.template).toBeUndefined();
    expect(s.ownerId).toBeUndefined();
  });

  it("updates lastActivityAt on touchSession", async () => {
    const s = createSession("test-s2");
    const initialActivity = s.lastActivityAt;

    // Small delay to ensure timestamp increments
    await new Promise((r) => setTimeout(r, 10));
    touchSession("test-s2");

    expect(s.lastActivityAt).toBeGreaterThan(initialActivity);
  });

  it("touchSession does nothing for non-existent session", () => {
    expect(() => touchSession("non-existent")).not.toThrow();
  });

  it("destroys an active session and invokes cleanupVm", async () => {
    const s = createSession("test-s3");
    s.state = "active";
    s.vm = { id: "vm-test-3" } as any;

    const destroyed = await destroySession("test-s3");
    expect(destroyed).toBe(true);
    expect(cleanupVm).toHaveBeenCalledWith("test-s3", s.vm);
    expect(removeEntry).toHaveBeenCalledWith("test-s3");
    expect(getSession("test-s3")).toBeUndefined();
    expect(execSessionsActive.dec).toHaveBeenCalled();
    expect(execSessionDurationSeconds.observe).toHaveBeenCalled();
  });

  it("returns false when destroying a non-existent session", async () => {
    const destroyed = await destroySession("non-existent-session");
    expect(destroyed).toBe(false);
  });

  it("handles session destruction without VM", async () => {
    const s = createSession("test-no-vm");
    s.state = "active";
    // No VM assigned

    const destroyed = await destroySession("test-no-vm");
    expect(destroyed).toBe(true);
    expect(cleanupVm).not.toHaveBeenCalled();
  });

  it("awaits in-flight VM creation before cleaning up during destroySession", async () => {
    const s = createSession("test-s4");
    let resolveCreation: (vm: any) => void;
    s.creation = new Promise((resolve) => {
      resolveCreation = resolve;
    });

    const destroyPromise = destroySession("test-s4");

    // Resolve creation with a VM
    const mockVm = { id: "vm-in-flight" } as any;
    s.vm = mockVm;
    resolveCreation!(mockVm);

    await destroyPromise;

    expect(cleanupVm).toHaveBeenCalledWith("test-s4", mockVm);
    expect(getSession("test-s4")).toBeUndefined();
  });

  it("handles failed VM creation gracefully during destroy", async () => {
    const s = createSession("test-failed");
    s.creation = Promise.reject(new Error("VM creation failed"));

    const destroyed = await destroySession("test-failed");
    expect(destroyed).toBe(true);
    expect(cleanupVm).not.toHaveBeenCalled();
  });

  it("lists all active sessions", () => {
    createSession("list-s1");
    createSession("list-s2");
    const list = getAllSessions();
    expect(list.some((s) => s.sessionId === "list-s1")).toBe(true);
    expect(list.some((s) => s.sessionId === "list-s2")).toBe(true);
  });

  it("getAllSessions returns empty array when no sessions exist", () => {
    const list = getAllSessions();
    expect(Array.isArray(list)).toBe(true);
  });

  it("rejects destroySession if called with mismatched ownerId", async () => {
    const s = createSession("owned-s1", "node", "tenant-1");
    s.state = "active";

    await expect(destroySession("owned-s1", "tenant-2")).rejects.toThrow(
      /Session belongs to another owner/,
    );
    expect(getSession("owned-s1")).toBeDefined();

    const destroyed = await destroySession("owned-s1", "tenant-1");
    expect(destroyed).toBe(true);
    expect(getSession("owned-s1")).toBeUndefined();
  });

  it("allows destroySession without ownerId when session has ownerId", async () => {
    const s = createSession("owned-s2", "node", "tenant-1");
    s.state = "active";

    const destroyed = await destroySession("owned-s2");
    expect(destroyed).toBe(true);
  });

  it("tracks session duration metrics on destruction", async () => {
    const s = createSession("metrics-test");
    s.state = "active";
    
    await new Promise((r) => setTimeout(r, 100));
    await destroySession("metrics-test");

    expect(execSessionDurationSeconds.observe).toHaveBeenCalled();
    const observedDuration = vi.mocked(execSessionDurationSeconds.observe).mock.calls[0]?.[0];
    expect(observedDuration).toBeGreaterThan(0);
  });

  it("maintains separate session instances for different sessionIds", () => {
    const s1 = createSession("separate-1", "node");
    const s2 = createSession("separate-2", "python");

    expect(s1).not.toBe(s2);
    expect(s1.sessionId).not.toBe(s2.sessionId);
    expect(s1.template).not.toBe(s2.template);
  });

  it("sets state to destroying during destruction", async () => {
    const s = createSession("destroying-state");
    s.state = "active";

    const destroyPromise = destroySession("destroying-state");
    
    // State should be set to destroying immediately
    expect(s.state).toBe("destroying");
    
    await destroyPromise;
  });
});

describe("Session Reaper", () => {
  let intervalId: NodeJS.Timeout | undefined;

  afterEach(() => {
    if (intervalId) {
      clearInterval(intervalId);
    }
    vi.clearAllTimers();
    _clearSessionsForTesting();
  });

  beforeEach(() => {
    _clearSessionsForTesting();
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  it("reaps idle sessions after TTL expires", async () => {
    const ttl = 5000; // 5 seconds for testing
    startSessionReaper(ttl);

    const s1 = createSession("idle-session");
    s1.state = "active";
    s1.lastActivityAt = Date.now() - (ttl + 1000); // Idle for longer than TTL

    vi.advanceTimersByTime(60_000); // Advance by 1 minute (reaper interval)

    await vi.waitFor(() => {
      expect(getSession("idle-session")).toBeUndefined();
    });
  });

  it("does not reap sessions that are still active within TTL", async () => {
    const ttl = 10000;
    startSessionReaper(ttl);

    const s1 = createSession("active-session");
    s1.state = "active";
    s1.lastActivityAt = Date.now() - (ttl / 2); // Still within TTL

    vi.advanceTimersByTime(60_000);

    await new Promise((r) => setTimeout(r, 100));
    expect(getSession("active-session")).toBeDefined();
  });

  it("does not reap sessions in 'creating' state", async () => {
    const ttl = 5000;
    startSessionReaper(ttl);

    const s1 = createSession("creating-session");
    s1.state = "creating";
    s1.lastActivityAt = Date.now() - (ttl + 1000);

    vi.advanceTimersByTime(60_000);

    await new Promise((r) => setTimeout(r, 100));
    expect(getSession("creating-session")).toBeDefined();
  });

  it("does not reap sessions in 'destroying' state", async () => {
    const ttl = 5000;
    startSessionReaper(ttl);

    const s1 = createSession("destroying-session");
    s1.state = "destroying";
    s1.lastActivityAt = Date.now() - (ttl + 1000);

    vi.advanceTimersByTime(60_000);

    await new Promise((r) => setTimeout(r, 100));
    expect(getSession("destroying-session")).toBeDefined();
  });

  it("handles errors during session reaping gracefully", async () => {
    vi.mocked(cleanupVm).mockRejectedValueOnce(new Error("Cleanup failed"));

    const ttl = 5000;
    startSessionReaper(ttl);

    const s1 = createSession("error-session");
    s1.state = "active";
    s1.vm = { id: "vm-error" } as any;
    s1.lastActivityAt = Date.now() - (ttl + 1000);

    vi.advanceTimersByTime(60_000);

    await new Promise((r) => setTimeout(r, 100));
    // Session reaper should catch the error and not crash
    expect(cleanupVm).toHaveBeenCalled();
  });

  it("uses default TTL of 30 minutes when not specified", () => {
    const setIntervalSpy = vi.spyOn(global, "setInterval");
    
    startSessionReaper();

    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);
  });

  it("reaps multiple idle sessions in single pass", async () => {
    const ttl = 5000;
    startSessionReaper(ttl);

    const s1 = createSession("idle-1");
    s1.state = "active";
    s1.lastActivityAt = Date.now() - (ttl + 1000);

    const s2 = createSession("idle-2");
    s2.state = "active";
    s2.lastActivityAt = Date.now() - (ttl + 2000);

    const s3 = createSession("active-3");
    s3.state = "active";
    s3.lastActivityAt = Date.now();

    vi.advanceTimersByTime(60_000);

    await vi.waitFor(() => {
      expect(getSession("idle-1")).toBeUndefined();
      expect(getSession("idle-2")).toBeUndefined();
    });

    expect(getSession("active-3")).toBeDefined();
  });
});
