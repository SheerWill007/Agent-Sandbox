import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./server.js", () => ({
  createMcpServer: vi.fn(() => ({
    connect: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock("@modelcontextprotocol/sdk/server/sse.js", () => {
  return {
    SSEServerTransport: vi.fn().mockImplementation((_path: string, _res: any) => ({
      handlePostMessage: vi.fn(async (_req: any, res: any) => {
        res.status(200).json({ ok: true });
      }),
    })),
  };
});

vi.mock("../session/session.js", () => ({
  destroySession: vi.fn(),
  createSession: vi.fn(),
  getSession: vi.fn(),
  touchSession: vi.fn(),
  getAllSessions: vi.fn(() => []),
  startSessionReaper: vi.fn(),
}));

vi.mock("../session/gateway.js", () => ({
  sendSessionMessage: vi.fn(),
  ensureSession: vi.fn(),
}));

import supertest from "supertest";
import { app } from "../app.js";

describe("MCP Routes", () => {
  const savedEnv = process.env.MCP_AUTH_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MCP_AUTH_TOKEN = "test-secret-123";
  });

  afterEach(() => {
    if (savedEnv !== undefined) {
      process.env.MCP_AUTH_TOKEN = savedEnv;
    } else {
      delete process.env.MCP_AUTH_TOKEN;
    }
  });


  describe("authentication", () => {
    it("rejects requests without Authorization header with 401", async () => {
      const res = await supertest(app).get("/mcp/");
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("API key required");
    });

    it("rejects requests with wrong Bearer token with 401", async () => {
      const res = await supertest(app)
        .get("/mcp/")
        .set("Authorization", "Bearer wrong-token");
      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Invalid API key");
    });

    it("rejects requests with malformed authorization header", async () => {
      const res = await supertest(app)
        .get("/mcp/")
        .set("Authorization", "Basic dXNlcjpwYXNz");
      expect(res.status).toBe(401);
    });

    it("uses MCP_AUTH_TOKEN env var for validation", async () => {
      process.env.MCP_AUTH_TOKEN = "custom-secret";

      const resFail = await supertest(app)
        .get("/mcp/")
        .set("Authorization", "Bearer test-secret-123");
      expect(resFail.status).toBe(401);
      const resPass = await supertest(app)
        .post("/mcp/messages?mcpSessionId=test")
        .set("Authorization", "Bearer custom-secret")
        .send({});
      expect(resPass.status).not.toBe(401);
    });
  });


  describe("POST /mcp/messages", () => {
    it("returns 404 when mcpSessionId not found in transports map", async () => {
      const res = await supertest(app)
        .post("/mcp/messages?mcpSessionId=nonexistent")
        .set("Authorization", "Bearer test-secret-123")
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("not found");
    });

    it("requires Authorization header", async () => {
      const res = await supertest(app)
        .post("/mcp/messages?mcpSessionId=test")
        .send({});

      expect(res.status).toBe(401);
    });

    it("accepts x-api-key header as alternative to Authorization", async () => {
      const res = await supertest(app)
        .post("/mcp/messages?mcpSessionId=test")
        .set("x-api-key", "test-secret-123")
        .send({});

      // Will be 404 because session doesn't exist, but auth passed
      expect(res.status).toBe(404);
    });
  });

  describe("GET /mcp/", () => {
    it("creates SSE transport when authenticated", async () => {
      const res = await supertest(app)
        .get("/mcp/")
        .set("Authorization", "Bearer test-secret-123");

      // SSE endpoint should return 200 and keep connection open
      expect(res.status).toBe(200);
    });

    it("rejects unauthenticated GET requests", async () => {
      const res = await supertest(app).get("/mcp/");
      expect(res.status).toBe(401);
    });
  });

  describe("MCP_AUTH_TOKEN environment variable", () => {
    it("allows requests when MCP_AUTH_TOKEN matches", async () => {
      process.env.MCP_AUTH_TOKEN = "secure-token-xyz";

      const res = await supertest(app)
        .post("/mcp/messages?mcpSessionId=test")
        .set("Authorization", "Bearer secure-token-xyz")
        .send({});

      expect(res.status).not.toBe(401);
    });

    it("rejects requests when MCP_AUTH_TOKEN doesn't match", async () => {
      process.env.MCP_AUTH_TOKEN = "correct-token";

      const res = await supertest(app)
        .post("/mcp/messages?mcpSessionId=test")
        .set("Authorization", "Bearer wrong-token")
        .send({});

      expect(res.status).toBe(401);
    });

    it("handles missing MCP_AUTH_TOKEN gracefully", async () => {
      delete process.env.MCP_AUTH_TOKEN;

      const res = await supertest(app)
        .post("/mcp/messages?mcpSessionId=test")
        .set("Authorization", "Bearer any-token")
        .send({});

      // Should still validate against key store
      expect(res.status).toBe(401);
    });
  });
});
