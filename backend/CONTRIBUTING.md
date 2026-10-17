# Contributing to Agent Sandbox

Thank you for your interest in contributing to Agent Sandbox! This guide will help you get started with development, testing, and submitting contributions.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Code Style](#code-style)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Adding Features](#adding-features)
- [Reporting Bugs](#reporting-bugs)

---

## Code of Conduct

We are committed to providing a welcoming and inclusive environment for all contributors. Please be respectful and constructive in all interactions.

---

## Getting Started

### Prerequisites

Before you begin, ensure you have:

- **Linux host** with KVM support (`/dev/kvm` accessible)
- [**Firecracker**](https://github.com/firecracker-microvm/firecracker) v1.16.0+ and **Jailer** binaries
- **Node.js** v18+ (v20 recommended)
- **Docker** (for building templates)
- **Root/sudo access** (for network namespaces, iptables, and Jailer)
- **Git** for version control

### Firecracker Setup

```bash
# Download Firecracker & Jailer
ARCH="$(uname -m)"
release_url="https://github.com/firecracker-microvm/firecracker/releases"
latest=$(basename $(curl -fsSLI -o /dev/null -w %{url_effective} ${release_url}/latest))

curl -L ${release_url}/download/${latest}/firecracker-${latest}-${ARCH}.tgz | tar -xz
sudo mv release-${latest}-${ARCH}/firecracker-${latest}-${ARCH} /usr/local/bin/firecracker
sudo mv release-${latest}-${ARCH}/jailer-${latest}-${ARCH} /usr/local/bin/jailer

# Create firecracker system user
sudo groupadd -g 982 firecracker 2>/dev/null || true
sudo useradd -u 997 -g 982 -M -s /usr/sbin/nologin firecracker 2>/dev/null || true

# Enable IP forwarding
sudo sysctl -w net.ipv4.ip_forward=1
echo "net.ipv4.ip_forward = 1" | sudo tee /etc/sysctl.d/99-ip-forward.conf
```

---

## Development Setup

### 1. Fork and Clone

```bash
git clone https://github.com/YOUR_USERNAME/Agent-Sandbox.git
cd Agent-Sandbox
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Download Kernel Artifact

```bash
sudo mkdir -p /var/lib/agent-sandbox/artifacts
wget https://github.com/SheerWill007/Agent-Sandbox/releases/download/Beta/vmlinux
sudo mv vmlinux /var/lib/agent-sandbox/artifacts/
sudo chown -R root:firecracker /var/lib/agent-sandbox/artifacts
sudo chmod 750 /var/lib/agent-sandbox/artifacts
```

### 4. Build Template Snapshots

```bash
sudo ./templates/build.sh node
sudo ./templates/build.sh python
sudo ./templates/build.sh go
```

### 5. Build TypeScript

```bash
npm run build
```

### 6. Run Tests

```bash
# Unit tests
npm test

# With coverage
npm run test:coverage

# E2E tests (requires root)
sudo npm run test:e2e

# Watch mode (for development)
npm run test:watch
```

---

## Project Structure

```
agent-sandbox/
├── src/
│   ├── auth/             # API key management, authentication middleware
│   ├── bench/            # Benchmark harness and performance suites
│   ├── mcp/              # Model Context Protocol server & routes
│   ├── routes/           # REST API endpoints
│   ├── session/          # Session lifecycle, gateway, manifest
│   ├── vm/               # VM management, networking, cleanup
│   ├── app.ts            # Express app configuration
│   ├── server.ts         # HTTP server entrypoint
│   ├── logger.ts         # Structured logging (Pino)
│   └── metrics.ts        # Prometheus metrics
├── sdk/
│   └── typescript/       # TypeScript/JavaScript SDK
├── templates/            # VM environment templates (Dockerfiles)
├── minimal-rootfs/       # Guest runtime and init scripts
├── .github/
│   └── workflows/        # CI/CD pipelines
├── package.json
└── tsconfig.json
```

---

## Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Your Changes

- Write clean, well-documented code
- Follow existing code patterns and conventions
- Add tests for new functionality
- Update documentation as needed

### 3. Run Linter and Formatter

```bash
# Check formatting
npm run format:check

# Auto-fix formatting
npm run format

# Lint code
npm run lint

# Auto-fix linting issues
npm run lint:fix
```

### 4. Run Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Ensure coverage is adequate (aim for >80%)
```

### 5. Commit Your Changes

Follow the [commit guidelines](#commit-guidelines) below.

### 6. Push and Open a Pull Request

```bash
git push origin feature/your-feature-name
```

---

## Testing

### Test Organization

- **Unit tests**: Test individual functions and modules in isolation
- **Integration tests**: Test interaction between components
- **E2E tests**: Test full VM lifecycle with real Firecracker (requires root)

### Writing Tests

All tests use [Vitest](https://vitest.dev/). Place test files next to the source files they test:

```
src/
├── auth/
│   ├── middleware.ts
│   └── middleware.test.ts
```

#### Example Test

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { myFunction } from "./my-module.js";

describe("myFunction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should do something correctly", () => {
    const result = myFunction("input");
    expect(result).toBe("expected output");
  });

  it("should handle errors gracefully", () => {
    expect(() => myFunction(null)).toThrow("Invalid input");
  });
});
```

### Test Coverage Requirements

- Aim for **>80% code coverage** on new code
- All new features must include tests
- Bug fixes should include regression tests
- Critical paths (auth, VM lifecycle, networking) require comprehensive coverage

### Running Specific Tests

```bash
# Run tests matching a pattern
npm test -- --grep "authentication"

# Run a specific test file
npm test src/auth/middleware.test.ts

# Run in watch mode
npm run test:watch
```

---

## Code Style

### TypeScript Guidelines

- Use **TypeScript** for all source code
- Prefer **explicit types** over `any`
- Use **interfaces** for object shapes
- Export types for public APIs
- Use **async/await** over callbacks
- Handle errors explicitly with try/catch

### Naming Conventions

- **Files**: `kebab-case.ts` (e.g., `vm-manager.ts`)
- **Functions**: `camelCase` (e.g., `createSession`)
- **Classes**: `PascalCase` (e.g., `VmManager`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `MAX_SLOTS`)
- **Interfaces**: `PascalCase` (e.g., `Session`, `VmNetworkInfo`)

### Code Formatting

We use **Prettier** for automatic formatting:

```bash
# Format all files
npm run format

# Check formatting
npm run format:check
```

### Linting

We use **ESLint** with TypeScript support:

```bash
# Lint all files
npm run lint

# Auto-fix issues
npm run lint:fix
```

---

## Commit Guidelines

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

#### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, missing semicolons, etc.)
- **refactor**: Code refactoring without functional changes
- **test**: Adding or updating tests
- **chore**: Build process, tooling, dependencies
- **perf**: Performance improvements
- **security**: Security fixes

#### Examples

```bash
feat(networking): add bandwidth throttling per VM

Implement TC-based bandwidth limiting with configurable rate and burst
parameters. Adds VM_BW_ENABLED, VM_BW_RATE_KBIT, VM_BW_BURST_KBIT env vars.

Closes #123
```

```bash
fix(auth): prevent query parameter API key leakage

Reject API keys passed via query parameters to comply with OWASP
recommendations and prevent credential exposure in logs.

Fixes #456
```

```bash
test(session): add reaper idle timeout tests

Add comprehensive test coverage for session reaper TTL expiration,
state-based filtering, and error handling.
```

---

## Pull Request Process

### Before Submitting

1. ✅ **All tests pass** (`npm test`)
2. ✅ **Code is formatted** (`npm run format`)
3. ✅ **No linting errors** (`npm run lint`)
4. ✅ **TypeScript compiles** (`npm run build`)
5. ✅ **Test coverage is adequate**
6. ✅ **Documentation is updated**
7. ✅ **Commit messages follow guidelines**

### PR Title Format

Use the same format as commit messages:

```
feat(vm): add support for custom kernel parameters
```

### PR Description Template

```markdown
## Description
Brief summary of changes

## Motivation
Why is this change needed?

## Changes
- List of specific changes
- Include breaking changes if any

## Testing
How was this tested?

## Checklist
- [ ] Tests pass locally
- [ ] Code is formatted and linted
- [ ] Documentation updated
- [ ] Breaking changes documented
```

### Review Process

1. **Automated checks** must pass (CI/CD pipeline)
2. At least **one approving review** required
3. **Address review feedback** promptly
4. **Squash commits** if requested
5. Maintainer will merge when ready

---

## Adding Features

### 1. Discuss First

For major features, open an **issue** or **discussion** first to:
- Validate the feature fits the project goals
- Get feedback on implementation approach
- Avoid duplicate work

### 2. Design Document (for large features)

Consider writing a brief design doc covering:
- **Problem**: What problem does this solve?
- **Solution**: High-level approach
- **API Changes**: New interfaces, breaking changes
- **Testing Strategy**: How will it be tested?
- **Alternatives**: What other approaches were considered?

### 3. Implement Incrementally

- Break large features into smaller PRs
- Each PR should be self-contained and testable
- Document work-in-progress with draft PRs

### 4. Update Documentation

- Update `README.md` for user-facing changes
- Add examples to SDK documentation
- Update API documentation
- Add inline code comments for complex logic

---

## Reporting Bugs

### Before Reporting

1. **Search existing issues** to avoid duplicates
2. **Test with latest version** from `main` branch
3. **Gather diagnostic information**:
   - Agent Sandbox version
   - Node.js version
   - Firecracker version
   - OS and kernel version
   - Relevant logs

### Bug Report Template

```markdown
## Description
Clear description of the bug

## Steps to Reproduce
1. Step one
2. Step two
3. ...

## Expected Behavior
What should happen?

## Actual Behavior
What actually happens?

## Environment
- Agent Sandbox version:
- Node.js version:
- Firecracker version:
- OS:
- Kernel:

## Logs
```
Paste relevant logs here
```

## Additional Context
Any other information, screenshots, etc.
```

---

## Security Vulnerabilities

**Do not open public issues for security vulnerabilities.**

Instead:
1. Email security details to: [your-email@example.com]
2. Include detailed reproduction steps
3. Allow time for a fix before public disclosure

---

## Questions?

- **General questions**: Open a [Discussion](https://github.com/SheerWill007/Agent-Sandbox/discussions)
- **Bug reports**: Open an [Issue](https://github.com/SheerWill007/Agent-Sandbox/issues)
- **Feature requests**: Open an [Issue](https://github.com/SheerWill007/Agent-Sandbox/issues) with the `enhancement` label

---

## License

By contributing to Agent Sandbox, you agree that your contributions will be licensed under the [ISC License](LICENSE).

---

## Thank You! 🎉

Your contributions help make Agent Sandbox better for everyone. We appreciate your time and effort!
