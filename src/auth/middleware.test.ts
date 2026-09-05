import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { extractKey, authMiddleware } from "./middleware.js";
import * as keyStore from "./key-store.js";
import * as rateLimiter from "./rate-limiter.js";

vi.mock("./key-store.js");
vi.mock("./rate-limiter.js");
vi.mock("../metrics.js", () => ({
  authRequestsTotal: { inc: vi.fn() },
  authRateLimitHits: { inc: vi.fn() },
}));

describe("auth middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AUTH_ENABLED;
  });

  describe("extractKey", () => {
    it("extracts key from Authorization Bearer header", () => {
      const req = {
        headers: { authorization: "Bearer sk_test_secret123" },
        query: {},
      } as unknown as Request;
      expect(extractKey(req)).toBe("sk_test_secret123");
    });

    it("extracts key from x-api-key header", () => {
      const req = {
        headers: { "x-api-key": "sk_test_header123" },
        query: {},
      } as unknown as Request;
      expect(extractKey(req)).toBe("sk_test_header123");
    });

    it("rejects/ignores query parameter API keys (OWASP compliance)", () => {
      const req = {
        headers: {},
        query: { api_key: "sk_test_query123", apiKey: "sk_test_query456" },
      } as unknown as Request;
      expect(extractKey(req)).toBeNull();
    });
  });

  describe("authMiddleware", () => {
    beforeEach(() => {
      vi.mocked(rateLimiter.checkRateLimit).mockReturnValue(true);
    });

    it("rejects requests missing an API key header with 401", () => {
      const req = { headers: {}, query: {} } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      authMiddleware("exec")(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "API key required" });
      expect(next).not.toHaveBeenCalled();
    });

    it("rejects invalid API keys with 401", () => {
      vi.mocked(keyStore.verifyKey).mockReturnValue(null);

      const req = {
        headers: { authorization: "Bearer sk_test_invalid" },
        query: {},
      } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      authMiddleware("exec")(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid API key" });
      expect(next).not.toHaveBeenCalled();
    });

    it("allows valid requests with matching scope", () => {
      vi.mocked(keyStore.verifyKey).mockReturnValue({
        id: "key-1",
        name: "Test Key",
        scopes: ["exec", "admin"],
        rateLimit: 100,
      });

      const req = {
        headers: { authorization: "Bearer sk_test_valid" },
        query: {},
      } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      authMiddleware("exec")(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.apiKey).toBeDefined();
      expect(req.apiKey?.id).toBe("key-1");
      expect(keyStore.touchKey).toHaveBeenCalledWith("key-1");
    });

    it("allows requests with multiple required scopes when all are present", () => {
      vi.mocked(keyStore.verifyKey).mockReturnValue({
        id: "key-admin",
        name: "Admin Key",
        scopes: ["exec", "admin", "metrics"],
        rateLimit: 200,
      });

      const req = {
        headers: { authorization: "Bearer sk_test_admin" },
        query: {},
      } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      authMiddleware("exec", "admin")(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.apiKey?.scopes).toEqual(["exec", "admin", "metrics"]);
    });

    it("rejects requests with missing required scope with 403", () => {
      vi.mocked(keyStore.verifyKey).mockReturnValue({
        id: "key-2",
        name: "Exec Only",
        scopes: ["exec"],
        rateLimit: 100,
      });

      const req = {
        headers: { authorization: "Bearer sk_test_exec" },
        query: {},
      } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      authMiddleware("admin")(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "Missing required scope: admin",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("rejects rate-limited requests with 429", () => {
      vi.mocked(keyStore.verifyKey).mockReturnValue({
        id: "key-limited",
        name: "Limited Key",
        scopes: ["exec"],
        rateLimit: 50,
      });
      vi.mocked(rateLimiter.checkRateLimit).mockReturnValue(false);

      const req = {
        headers: { authorization: "Bearer sk_test_limited" },
        query: {},
      } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      authMiddleware("exec")(req, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({
        error: "Rate limit exceeded",
        retryAfter: 60,
      });
      expect(next).not.toHaveBeenCalled();
      expect(rateLimiter.checkRateLimit).toHaveBeenCalledWith("key-limited", 50);
    });

    it("bypasses authentication when AUTH_ENABLED=false", () => {
      process.env.AUTH_ENABLED = "false";

      const req = { headers: {}, query: {} } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      authMiddleware("admin")(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("grants only exec scope to legacy MCP_AUTH_TOKEN", () => {
      process.env.MCP_AUTH_TOKEN = "legacy-token-secret";
      const req = {
        headers: { authorization: "Bearer legacy-token-secret" },
        query: {},
      } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      authMiddleware("exec")(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.apiKey).toBeDefined();
      expect(req.apiKey?.scopes).toEqual(["exec"]);
      expect(req.apiKey?.rateLimit).toBe(100);

      // Now verify it fails admin check
      const adminNext = vi.fn();
      authMiddleware("admin")(req, res, adminNext);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(adminNext).not.toHaveBeenCalled();
    });

    it("handles Bearer token with extra whitespace", () => {
      vi.mocked(keyStore.verifyKey).mockReturnValue({
        id: "key-trim",
        name: "Trim Test",
        scopes: ["exec"],
        rateLimit: 100,
      });

      const req = {
        headers: { authorization: "Bearer   sk_test_spaces   " },
        query: {},
      } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      authMiddleware("exec")(req, res, next);

      expect(keyStore.verifyKey).toHaveBeenCalledWith("sk_test_spaces");
      expect(next).toHaveBeenCalled();
    });

    it("handles x-api-key header with whitespace", () => {
      vi.mocked(keyStore.verifyKey).mockReturnValue({
        id: "key-header",
        name: "Header Test",
        scopes: ["metrics"],
        rateLimit: 100,
      });

      const req = {
        headers: { "x-api-key": "  sk_test_header  " },
        query: {},
      } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      authMiddleware("metrics")(req, res, next);

      expect(keyStore.verifyKey).toHaveBeenCalledWith("sk_test_header");
      expect(next).toHaveBeenCalled();
    });

    it("prefers Authorization header over x-api-key when both present", () => {
      vi.mocked(keyStore.verifyKey).mockReturnValue({
        id: "key-auth",
        name: "Auth Key",
        scopes: ["exec"],
        rateLimit: 100,
      });

      const req = {
        headers: {
          authorization: "Bearer sk_test_auth",
          "x-api-key": "sk_test_header",
        },
        query: {},
      } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      authMiddleware("exec")(req, res, next);

      expect(keyStore.verifyKey).toHaveBeenCalledWith("sk_test_auth");
      expect(next).toHaveBeenCalled();
    });
  });
});
