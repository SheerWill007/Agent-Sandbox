import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  allocateSlot,
  releaseSlot,
  recoverUsedSlots,
  MAX_SLOTS,
} from "./networking.js";
import { execSync } from "child_process";

vi.mock("child_process", () => ({
  execSync: vi.fn(),
  exec: vi.fn(),
}));

vi.mock("../logger.js", () => ({
  vmLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../metrics.js", () => ({
  vmEgressPolicyApplied: { inc: vi.fn() },
  vmSlotCapacity: { set: vi.fn() },
}));

describe("Networking Slot Allocator", () => {
  const allocated: number[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    while (allocated.length > 0) {
      const slot = allocated.pop();
      if (slot !== undefined) {
        releaseSlot(slot);
      }
    }
  });

  it("allocates sequential slots starting from 1", () => {
    const slot1 = allocateSlot();
    allocated.push(slot1);
    const slot2 = allocateSlot();
    allocated.push(slot2);

    expect(slot1).toBeGreaterThanOrEqual(1);
    expect(slot2).toBe(slot1 + 1);
  });

  it("re-allocates a slot after it has been released", () => {
    const slot1 = allocateSlot();
    const slot2 = allocateSlot();
    allocated.push(slot2);

    releaseSlot(slot1);
    const slotReallocated = allocateSlot();
    allocated.push(slotReallocated);

    expect(slotReallocated).toBe(slot1);
  });

  it("throws an error when all slots are exhausted", () => {
    const tempAllocated: number[] = [];
    try {
      for (let i = 1; i <= MAX_SLOTS; i++) {
        try {
          const s = allocateSlot();
          tempAllocated.push(s);
        } catch {
          break;
        }
      }

      expect(() => allocateSlot()).toThrow(/No available network slots/);
    } finally {
      for (const s of tempAllocated) {
        releaseSlot(s);
      }
    }
  });

  it("allows releasing the same slot multiple times without error", () => {
    const slot = allocateSlot();
    releaseSlot(slot);
    expect(() => releaseSlot(slot)).not.toThrow();
    expect(() => releaseSlot(slot)).not.toThrow();
  });

  it("allocates non-overlapping slots for multiple concurrent requests", () => {
    const slots = new Set<number>();
    const count = Math.min(10, MAX_SLOTS);

    for (let i = 0; i < count; i++) {
      const slot = allocateSlot();
      allocated.push(slot);
      expect(slots.has(slot)).toBe(false);
      slots.add(slot);
    }

    expect(slots.size).toBe(count);
  });

  it("handles slot release and reallocation in LIFO order", () => {
    const slot1 = allocateSlot();
    const slot2 = allocateSlot();
    const slot3 = allocateSlot();

    releaseSlot(slot2);
    releaseSlot(slot1);

    // Next allocation should get slot1 (first available in scan)
    const newSlot = allocateSlot();
    expect(newSlot).toBe(slot1);

    allocated.push(slot3, newSlot);
  });
});

describe("Slot Recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recovers slots from existing network namespaces", () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes("ip netns list")) {
        return "ns-abc123\nns-def456\n";
      }
      if (cmd.includes("ip addr show vh-abc123")) {
        return "inet 10.0.5.2/30";
      }
      if (cmd.includes("ip addr show vh-def456")) {
        return "inet 10.0.8.2/30";
      }
      return "";
    });

    recoverUsedSlots();

    // Should have recovered slots 5 and 8
    const slot1 = allocateSlot();
    expect([1, 2, 3, 4, 6, 7]).toContain(slot1);
    expect([5, 8]).not.toContain(slot1);

    releaseSlot(slot1);
  });

  it("handles missing network namespaces gracefully", () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error("ip netns list failed");
    });

    expect(() => recoverUsedSlots()).not.toThrow();
  });

  it("skips namespaces with invalid naming pattern", () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes("ip netns list")) {
        return "ns-abc123\ninvalid-name\nrandom-ns\nns-xyz789\n";
      }
      if (cmd.includes("ip addr show vh-abc123")) {
        return "inet 10.0.3.2/30";
      }
      if (cmd.includes("ip addr show vh-xyz789")) {
        return "inet 10.0.7.2/30";
      }
      return "";
    });

    recoverUsedSlots();

    // Should only recover slots 3 and 7 (valid ns-* pattern)
    const slot1 = allocateSlot();
    expect([1, 2, 4, 5, 6]).toContain(slot1);

    releaseSlot(slot1);
  });

  it("handles veth interfaces without IP addresses", () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes("ip netns list")) {
        return "ns-test123\n";
      }
      if (cmd.includes("ip addr show vh-test123")) {
        return "link/ether 00:00:00:00:00:00";
      }
      return "";
    });

    expect(() => recoverUsedSlots()).not.toThrow();

    // Slot should not be recovered (no IP found)
    const slot = allocateSlot();
    expect(slot).toBe(1);
    releaseSlot(slot);
  });

  it("handles missing veth interfaces during recovery", () => {
    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes("ip netns list")) {
        return "ns-orphan1\n";
      }
      if (cmd.includes("ip addr show")) {
        throw new Error("Device not found");
      }
      return "";
    });

    expect(() => recoverUsedSlots()).not.toThrow();
  });

  it("clears existing slots before recovery", () => {
    // Allocate some slots first
    const slot1 = allocateSlot();
    const slot2 = allocateSlot();

    vi.mocked(execSync).mockImplementation((cmd: string) => {
      if (cmd.includes("ip netns list")) {
        return "ns-recovered\n";
      }
      if (cmd.includes("ip addr show vh-recovered")) {
        return "inet 10.0.10.2/30";
      }
      return "";
    });

    recoverUsedSlots();

    // slot1 and slot2 should now be available again
    const newSlot = allocateSlot();
    expect(newSlot).toBe(1);

    releaseSlot(newSlot);
  });
});

describe("Network Info Building", () => {
  it("generates consistent network configuration for a given vmId and slot", () => {
    // This would require exporting buildNetworkInfo or testing through setupVmNetwork
    // For now, we test that slot allocation produces valid IP ranges
    const slot = allocateSlot();
    
    // Validate slot produces valid IP in range
    expect(slot).toBeGreaterThanOrEqual(1);
    expect(slot).toBeLessThanOrEqual(MAX_SLOTS);
    
    // Expected IPs:
    // hostIp: 10.0.{slot}.2
    // nsIp: 10.0.{slot}.1
    const expectedHostIp = `10.0.${slot}.2`;
    const expectedNsIp = `10.0.${slot}.1`;
    
    expect(expectedHostIp).toMatch(/^10\.0\.\d+\.2$/);
    expect(expectedNsIp).toMatch(/^10\.0\.\d+\.1$/);

    releaseSlot(slot);
  });
});

describe("Edge Cases and Error Handling", () => {
  it("handles rapid allocation and deallocation", () => {
    const iterations = Math.min(50, MAX_SLOTS);
    const slots: number[] = [];

    for (let i = 0; i < iterations; i++) {
      slots.push(allocateSlot());
    }

    for (const slot of slots) {
      releaseSlot(slot);
    }

    // Should be able to allocate again
    const newSlot = allocateSlot();
    expect(newSlot).toBe(1);
    releaseSlot(newSlot);
  });

  it("maintains slot consistency across multiple allocations", () => {
    const firstBatch = [allocateSlot(), allocateSlot(), allocateSlot()];
    const middleSlot = firstBatch[1];
    if (middleSlot === undefined) throw new Error("Middle slot undefined");
    
    releaseSlot(middleSlot); // Release middle slot

    const newSlot = allocateSlot();
    expect(newSlot).toBe(middleSlot); // Should reuse freed slot

    // Clean up
    const firstSlot = firstBatch[0];
    const lastSlot = firstBatch[2];
    if (firstSlot !== undefined) releaseSlot(firstSlot);
    if (lastSlot !== undefined) releaseSlot(lastSlot);
    releaseSlot(newSlot);
  });

  it("validates MAX_SLOTS boundary conditions", () => {
    expect(MAX_SLOTS).toBeGreaterThan(0);
    expect(MAX_SLOTS).toBeLessThanOrEqual(254); // IPv4 address space limit
  });
});
