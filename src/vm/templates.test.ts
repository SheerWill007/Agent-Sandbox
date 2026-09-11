import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  getTemplate,
  listTemplates,
  resolveTemplateName,
  loadTemplateRegistry,
  getDefaultTemplate,
} from "./templates.js";

vi.mock("../logger.js", () => ({
  vmLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Template Registry", () => {
  let tmpDir: string;
  let artifactsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "template-test-"));
    artifactsDir = path.join(tmpDir, "artifacts");
    fs.mkdirSync(artifactsDir, { recursive: true });
    vi.stubEnv("FIRECRACKER_ARTIFACTS_DIR", artifactsDir);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe("Legacy Template Support", () => {
    it("registers legacy template when no templates directory exists", () => {
      // Create legacy flat artifacts
      fs.writeFileSync(path.join(artifactsDir, "rootfs.ext4"), "fake rootfs");
      fs.writeFileSync(path.join(artifactsDir, "snapshot-exec"), "fake snapshot");
      fs.writeFileSync(path.join(artifactsDir, "mem-exec"), "fake mem");

      loadTemplateRegistry();

      const nodeTemplate = getTemplate("node");
      expect(nodeTemplate).toBeDefined();
      expect(nodeTemplate?.manifest.name).toBe("node");
      expect(nodeTemplate?.manifest.displayName).toBe("Node.js (Legacy)");
      expect(resolveTemplateName()).toBe("node");
      expect(resolveTemplateName("exec")).toBe("node");
      expect(resolveTemplateName("node")).toBe("node");
    });

    it("does not register legacy template when artifacts are missing", () => {
      // Only create some files, not all
      fs.writeFileSync(path.join(artifactsDir, "rootfs.ext4"), "fake rootfs");
      // Missing snapshot-exec and mem-exec

      loadTemplateRegistry();

      const nodeTemplate = getTemplate("node");
      expect(nodeTemplate).toBeUndefined();
    });

    it("falls back to legacy template when templates dir exists but is empty", () => {
      const templatesDir = path.join(artifactsDir, "templates");
      fs.mkdirSync(templatesDir, { recursive: true });

      // Create legacy artifacts
      fs.writeFileSync(path.join(artifactsDir, "rootfs.ext4"), "fake rootfs");
      fs.writeFileSync(path.join(artifactsDir, "snapshot-exec"), "fake snapshot");
      fs.writeFileSync(path.join(artifactsDir, "mem-exec"), "fake mem");

      loadTemplateRegistry();

      const nodeTemplate = getTemplate("node");
      expect(nodeTemplate).toBeDefined();
    });
  });

  describe("Template Discovery", () => {
    it("discovers and loads valid templates from templates directory", () => {
      const templatesDir = path.join(artifactsDir, "templates", "custom-python");
      fs.mkdirSync(templatesDir, { recursive: true });

      const manifest = {
        name: "custom-python",
        displayName: "Python 3.12 Custom",
        version: "1.0.0",
        description: "Python environment",
        tools: ["python3", "pip"],
        baseImage: "alpine",
        createdAt: new Date().toISOString(),
      };

      fs.writeFileSync(path.join(templatesDir, "template.json"), JSON.stringify(manifest));
      fs.writeFileSync(path.join(templatesDir, "rootfs.ext4"), "data");
      fs.writeFileSync(path.join(templatesDir, "snapshot"), "data");
      fs.writeFileSync(path.join(templatesDir, "memory"), "data");

      loadTemplateRegistry();

      const custom = getTemplate("custom-python");
      expect(custom).toBeDefined();
      expect(custom?.manifest.displayName).toBe("Python 3.12 Custom");

      const list = listTemplates();
      expect(list.some((t) => t.name === "custom-python")).toBe(true);
    });

    it("discovers multiple templates from templates directory", () => {
      const createTemplate = (name: string, displayName: string) => {
        const templateDir = path.join(artifactsDir, "templates", name);
        fs.mkdirSync(templateDir, { recursive: true });

        const manifest = {
          name,
          displayName,
          version: "1.0.0",
          description: `${name} environment`,
          tools: [name],
          baseImage: "alpine",
          createdAt: new Date().toISOString(),
        };

        fs.writeFileSync(path.join(templateDir, "template.json"), JSON.stringify(manifest));
        fs.writeFileSync(path.join(templateDir, "rootfs.ext4"), "data");
        fs.writeFileSync(path.join(templateDir, "snapshot"), "data");
        fs.writeFileSync(path.join(templateDir, "memory"), "data");
      };

      createTemplate("node", "Node.js 22");
      createTemplate("python", "Python 3.12");
      createTemplate("go", "Go 1.23");

      loadTemplateRegistry();

      const list = listTemplates();
      expect(list).toHaveLength(3);
      expect(list.map((t) => t.name).sort()).toEqual(["go", "node", "python"]);
    });

    it("skips invalid template directories without crashing", () => {
      const templatesDir = path.join(artifactsDir, "templates");
      fs.mkdirSync(templatesDir, { recursive: true });

      // Create valid template
      const validDir = path.join(templatesDir, "valid");
      fs.mkdirSync(validDir);
      const manifest = {
        name: "valid",
        displayName: "Valid Template",
        version: "1.0.0",
        description: "Valid",
        tools: ["node"],
        baseImage: "alpine",
        createdAt: new Date().toISOString(),
      };
      fs.writeFileSync(path.join(validDir, "template.json"), JSON.stringify(manifest));
      fs.writeFileSync(path.join(validDir, "rootfs.ext4"), "data");
      fs.writeFileSync(path.join(validDir, "snapshot"), "data");
      fs.writeFileSync(path.join(validDir, "memory"), "data");

      // Create invalid template (missing files)
      const invalidDir = path.join(templatesDir, "invalid");
      fs.mkdirSync(invalidDir);
      fs.writeFileSync(path.join(invalidDir, "template.json"), "{}");

      loadTemplateRegistry();

      const valid = getTemplate("valid");
      expect(valid).toBeDefined();

      const invalid = getTemplate("invalid");
      expect(invalid).toBeUndefined();
    });

    it("skips non-directory entries in templates directory", () => {
      const templatesDir = path.join(artifactsDir, "templates");
      fs.mkdirSync(templatesDir, { recursive: true });

      // Create a file (not directory)
      fs.writeFileSync(path.join(templatesDir, "not-a-directory.txt"), "content");

      loadTemplateRegistry();

      // Should not crash
      const list = listTemplates();
      expect(Array.isArray(list)).toBe(true);
    });
  });

  describe("Template Validation", () => {
    it("rejects template with missing manifest file", () => {
      const templatesDir = path.join(artifactsDir, "templates", "no-manifest");
      fs.mkdirSync(templatesDir, { recursive: true });

      // Create files except template.json
      fs.writeFileSync(path.join(templatesDir, "rootfs.ext4"), "data");
      fs.writeFileSync(path.join(templatesDir, "snapshot"), "data");
      fs.writeFileSync(path.join(templatesDir, "memory"), "data");

      loadTemplateRegistry();

      const template = getTemplate("no-manifest");
      expect(template).toBeUndefined();
    });

    it("rejects template with missing rootfs file", () => {
      const templatesDir = path.join(artifactsDir, "templates", "no-rootfs");
      fs.mkdirSync(templatesDir, { recursive: true });

      const manifest = {
        name: "no-rootfs",
        displayName: "No Rootfs",
        version: "1.0.0",
        description: "Missing rootfs",
        tools: ["node"],
        baseImage: "alpine",
        createdAt: new Date().toISOString(),
      };

      fs.writeFileSync(path.join(templatesDir, "template.json"), JSON.stringify(manifest));
      fs.writeFileSync(path.join(templatesDir, "snapshot"), "data");
      fs.writeFileSync(path.join(templatesDir, "memory"), "data");

      loadTemplateRegistry();

      const template = getTemplate("no-rootfs");
      expect(template).toBeUndefined();
    });

    it("loads template with optional resource specifications", () => {
      const templatesDir = path.join(artifactsDir, "templates", "with-resources");
      fs.mkdirSync(templatesDir, { recursive: true });

      const manifest = {
        name: "with-resources",
        displayName: "High Memory Template",
        version: "1.0.0",
        description: "Template with custom resources",
        tools: ["node"],
        baseImage: "alpine",
        resources: {
          memSizeMib: 512,
          vcpuCount: 2,
        },
        createdAt: new Date().toISOString(),
      };

      fs.writeFileSync(path.join(templatesDir, "template.json"), JSON.stringify(manifest));
      fs.writeFileSync(path.join(templatesDir, "rootfs.ext4"), "data");
      fs.writeFileSync(path.join(templatesDir, "snapshot"), "data");
      fs.writeFileSync(path.join(templatesDir, "memory"), "data");

      loadTemplateRegistry();

      const template = getTemplate("with-resources");
      expect(template).toBeDefined();
      expect(template?.manifest.resources?.memSizeMib).toBe(512);
      expect(template?.manifest.resources?.vcpuCount).toBe(2);
    });
  });

  describe("Template Resolution", () => {
    beforeEach(() => {
      // Setup default node template
      fs.writeFileSync(path.join(artifactsDir, "rootfs.ext4"), "fake rootfs");
      fs.writeFileSync(path.join(artifactsDir, "snapshot-exec"), "fake snapshot");
      fs.writeFileSync(path.join(artifactsDir, "mem-exec"), "fake mem");
      loadTemplateRegistry();
    });

    it("throws error when resolving an unknown template", () => {
      expect(() => resolveTemplateName("non-existent-lang")).toThrow(
        /Unknown template "non-existent-lang"/,
      );
    });

    it("resolves undefined to default template", () => {
      expect(resolveTemplateName(undefined)).toBe("node");
    });

    it("resolves 'exec' to default template for backward compatibility", () => {
      expect(resolveTemplateName("exec")).toBe("node");
    });

    it("resolves explicit template name when it exists", () => {
      expect(resolveTemplateName("node")).toBe("node");
    });

    it("includes available templates in error message", () => {
      try {
        resolveTemplateName("invalid");
        expect.fail("Should have thrown");
      } catch (err: any) {
        expect(err.message).toContain("Available:");
        expect(err.message).toContain("node");
      }
    });
  });

  describe("Template Retrieval", () => {
    beforeEach(() => {
      const templatesDir = path.join(artifactsDir, "templates", "test-template");
      fs.mkdirSync(templatesDir, { recursive: true });

      const manifest = {
        name: "test-template",
        displayName: "Test Template",
        version: "1.0.0",
        description: "For testing",
        tools: ["test"],
        baseImage: "alpine",
        createdAt: new Date().toISOString(),
      };

      fs.writeFileSync(path.join(templatesDir, "template.json"), JSON.stringify(manifest));
      fs.writeFileSync(path.join(templatesDir, "rootfs.ext4"), "rootfs");
      fs.writeFileSync(path.join(templatesDir, "snapshot"), "snap");
      fs.writeFileSync(path.join(templatesDir, "memory"), "mem");

      loadTemplateRegistry();
    });

    it("returns template when it exists", () => {
      const template = getTemplate("test-template");
      expect(template).toBeDefined();
      expect(template?.manifest.name).toBe("test-template");
    });

    it("returns undefined when template does not exist", () => {
      const template = getTemplate("non-existent");
      expect(template).toBeUndefined();
    });

    it("returns default template via getDefaultTemplate", () => {
      // Add legacy node template
      fs.writeFileSync(path.join(artifactsDir, "rootfs.ext4"), "fake rootfs");
      fs.writeFileSync(path.join(artifactsDir, "snapshot-exec"), "fake snapshot");
      fs.writeFileSync(path.join(artifactsDir, "mem-exec"), "fake mem");
      
      // Reload to include node template
      loadTemplateRegistry();

      const defaultTemplate = getDefaultTemplate();
      expect(defaultTemplate).toBeDefined();
      expect(defaultTemplate.manifest.name).toBe("node");
    });

    it("throws error when default template is not found", () => {
      // Clear registry by loading without any templates
      const emptyDir = path.join(tmpDir, "empty");
      fs.mkdirSync(emptyDir);
      vi.stubEnv("FIRECRACKER_ARTIFACTS_DIR", emptyDir);

      loadTemplateRegistry();

      expect(() => getDefaultTemplate()).toThrow(/Default template "node" not found/);
    });

    it("returns complete template paths", () => {
      const template = getTemplate("test-template");
      expect(template?.rootfsPath).toContain("rootfs.ext4");
      expect(template?.snapshotPath).toContain("snapshot");
      expect(template?.memoryPath).toContain("memory");
    });
  });

  describe("Template Listing", () => {
    it("returns empty array when no templates are registered", () => {
      loadTemplateRegistry();
      const list = listTemplates();
      expect(Array.isArray(list)).toBe(true);
    });

    it("returns all registered templates", () => {
      const createTemplate = (name: string) => {
        const templateDir = path.join(artifactsDir, "templates", name);
        fs.mkdirSync(templateDir, { recursive: true });

        const manifest = {
          name,
          displayName: `${name} Template`,
          version: "1.0.0",
          description: name,
          tools: [name],
          baseImage: "alpine",
          createdAt: new Date().toISOString(),
        };

        fs.writeFileSync(path.join(templateDir, "template.json"), JSON.stringify(manifest));
        fs.writeFileSync(path.join(templateDir, "rootfs.ext4"), "data");
        fs.writeFileSync(path.join(templateDir, "snapshot"), "data");
        fs.writeFileSync(path.join(templateDir, "memory"), "data");
      };

      createTemplate("alpha");
      createTemplate("beta");
      createTemplate("gamma");

      loadTemplateRegistry();

      const list = listTemplates();
      expect(list).toHaveLength(3);
      
      const names = list.map((t) => t.name).sort();
      expect(names).toEqual(["alpha", "beta", "gamma"]);
    });

    it("returns only manifest information, not file paths", () => {
      const templatesDir = path.join(artifactsDir, "templates", "test");
      fs.mkdirSync(templatesDir, { recursive: true });

      const manifest = {
        name: "test",
        displayName: "Test",
        version: "1.0.0",
        description: "Test template",
        tools: ["test"],
        baseImage: "alpine",
        createdAt: new Date().toISOString(),
      };

      fs.writeFileSync(path.join(templatesDir, "template.json"), JSON.stringify(manifest));
      fs.writeFileSync(path.join(templatesDir, "rootfs.ext4"), "data");
      fs.writeFileSync(path.join(templatesDir, "snapshot"), "data");
      fs.writeFileSync(path.join(templatesDir, "memory"), "data");

      loadTemplateRegistry();

      const list = listTemplates();
      expect(list[0]).not.toHaveProperty("rootfsPath");
      expect(list[0]).not.toHaveProperty("snapshotPath");
      expect(list[0]).not.toHaveProperty("memoryPath");
      expect(list[0]).toHaveProperty("name");
      expect(list[0]).toHaveProperty("displayName");
    });
  });
});
