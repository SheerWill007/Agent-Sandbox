# Agent Sandbox

Hardware-isolated execution environment for AI agents, built on Firecracker microVMs.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/SheerWill007/Agent-Sandbox)](https://github.com/SheerWill007/Agent-Sandbox/releases/latest)
[![Tests](https://github.com/SheerWill007/Agent-Sandbox/actions/workflows/test.yml/badge.svg)](https://github.com/SheerWill007/Agent-Sandbox/actions/workflows/test.yml)

Agent Sandbox gives each AI agent session its own Linux machine. Commands, package installs, file operations, child processes and network access all run inside a dedicated microVM that boots in under 100 milliseconds and is destroyed when the session ends. Isolation is enforced by the KVM hypervisor rather than by containers or a shared kernel.

- Website: https://agent-sandboxx.vercel.app
- Documentation: [docs/RELEASE.md](docs/RELEASE.md)
- Latest release: [v1.0.0](https://github.com/SheerWill007/Agent-Sandbox/releases/tag/v1.0.0)

## Contents

- [Features](#features)
- [How It Works](#how-it-works)
- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Security Model](#security-model)
- [Performance](#performance)
- [Development](#development)
- [Repository Layout](#repository-layout)
- [Contributing](#contributing)
- [License](#license)

## Features

| Area | Capability |
|---|---|
| Isolation | Each session runs its own Linux kernel under KVM, confined by the Firecracker Jailer |
| Startup | About 90 ms cold start; snapshot restore in under 4 ms (p95) |
| Runtimes | Prebuilt Node.js, Python and Go templates; custom templates from any Dockerfile |
| Networking | Per-VM network namespace with DNS domain filtering, IP/port egress rules and optional bandwidth limits |
| Interfaces | REST API, TypeScript SDK, and Model Context Protocol (MCP) server over stdio and SSE |
| Access control | API keys with scopes (`exec`, `admin`, `metrics`) and per-key rate limits |
| Lifecycle | Sessions expire after 30 minutes of inactivity; orphaned VMs are recovered at startup |
| Observability | Prometheus metrics and structured JSON logging (Pino) |

## How It Works

1. A client sends a request for a session through the REST API, the SDK or MCP.
2. The server restores a VM from a prebuilt template snapshot inside a Jailer chroot, with its own cgroup limits and network namespace.
3. Commands and file operations are sent to an agent inside the guest over vsock.
4. When the session is deleted or reaches its idle timeout, the VM, its jail directory and its network namespace are removed.

## Requirements

| Component | Version |
|---|---|
| Operating system | Linux with KVM (`/dev/kvm` must be accessible) |
| Node.js | 20.12 or later |
| Firecracker and Jailer | 1.0 or later |
| Docker | Required only to build environment templates |
| Privileges | Root, for the Jailer, network namespaces and iptables |

Windows and macOS are supported only by running the server inside a Linux VM with nested virtualization (WSL2, Lima or UTM). See [docs/RELEASE.md](docs/RELEASE.md#installation-instructions) for platform-specific instructions.

## Installation

**1. Install Firecracker and Jailer**

```bash
ARCH="$(uname -m)"
RELEASE_URL="https://github.com/firecracker-microvm/firecracker/releases"
LATEST="$(basename "$(curl -fsSLI -o /dev/null -w '%{url_effective}' "${RELEASE_URL}/latest")")"
curl -fsSL "${RELEASE_URL}/download/${LATEST}/firecracker-${LATEST}-${ARCH}.tgz" | tar -xz
sudo mv "release-${LATEST}-${ARCH}/firecracker-${LATEST}-${ARCH}" /usr/local/bin/firecracker
sudo mv "release-${LATEST}-${ARCH}/jailer-${LATEST}-${ARCH}" /usr/local/bin/jailer
```

**2. Prepare the host**

```bash
sudo sysctl -w net.ipv4.ip_forward=1
sudo groupadd -g 982 firecracker 2>/dev/null || true
sudo useradd -u 997 -g 982 -M -s /usr/sbin/nologin firecracker 2>/dev/null || true
sudo mkdir -p /var/lib/agent-sandbox/artifacts
```

Place an uncompressed, Firecracker-compatible guest kernel at `/var/lib/agent-sandbox/artifacts/vmlinux`. The [Firecracker getting started guide](https://github.com/firecracker-microvm/firecracker/blob/main/docs/getting-started.md) describes how to obtain one.

**3. Build the server and templates**

```bash
git clone --branch v1.0.0 https://github.com/SheerWill007/Agent-Sandbox.git
cd Agent-Sandbox/backend
npm ci
npm run build

sudo ./templates/build.sh node
sudo ./templates/build.sh python
sudo ./templates/build.sh go
```

**4. Create an API key and start the server**

```bash
sudo npm run keys -- create my-key
sudo npm start
```

The key is printed once and cannot be retrieved later. The server listens on port 3000 by default.

## Usage

### REST API

```bash
export SANDBOX_API_KEY="sk_test_..."

curl -X POST http://localhost:3000/exec/my-session/execute \
  -H "Authorization: Bearer $SANDBOX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"template": "python", "command": "python3", "args": ["-c", "print(2 + 2)"]}'
```

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/exec/templates` | List available templates |
| `POST` | `/exec/:sessionId/execute` | Run a command, creating the session if needed |
| `POST` | `/exec/:sessionId/write` | Write a file in the session workspace |
| `GET` | `/exec/:sessionId/read` | Read a file from the session workspace |
| `GET` | `/exec/:sessionId/files` | List files in the session workspace |
| `DELETE` | `/exec/:sessionId` | Destroy the session and its VM |
| `GET` | `/health`, `/ready` | Liveness and readiness probes |
| `GET` | `/metrics` | Prometheus metrics (requires the `metrics` scope) |

API keys are accepted only in the `Authorization` header. Key management endpoints under `/admin/keys` require the `admin` scope. The full request and response reference is in [docs/RELEASE.md](docs/RELEASE.md#api-documentation).

### TypeScript SDK

The SDK is located in [`backend/sdk/typescript`](backend/sdk/typescript) and has no runtime dependencies.

```ts
import { Sandbox } from "@agent-sandbox/sdk";

const sandbox = new Sandbox({
  baseUrl: "http://localhost:3000",
  headers: { Authorization: `Bearer ${process.env.SANDBOX_API_KEY}` },
});

const session = sandbox.create({ template: "python" });
const result = await session.runCode("print(2 + 2)");
console.log(result.exitCode);

await session.destroy();
```

### MCP Server

Agent Sandbox exposes its tools to MCP-compatible clients over two transports:

- **stdio:** `npm run mcp` in the `backend` directory
- **SSE:** served by the main server under `/mcp` (requires the `exec` scope)

See [docs/RELEASE.md](docs/RELEASE.md#mcp-integration) for the tool list and client configuration.

## Configuration

The server is configured through environment variables. [`backend/example.env`](backend/example.env) lists every option with its default. The most commonly changed settings are:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |
| `AUTH_ENABLED` | `true` | Require API keys |
| `AUTH_KEYS_PATH` | `/var/lib/agent-sandbox/keys.json` | Key store location |
| `VM_VCPU_COUNT` | `1` | vCPUs per VM |
| `VM_MEM_SIZE_MIB` | `128` | Guest memory per VM |
| `VM_PIDS_LIMIT` | `256` | Maximum processes per VM |
| `VM_DNS_MODE` | `none` | DNS filtering: `none`, `allow` or `deny` |
| `VM_DEST_MODE` | `none` | Egress IP/port filtering: `none`, `allow` or `deny` |
| `VM_BW_ENABLED` | `false` | Enable bandwidth throttling |

## Security Model

Agent Sandbox applies several independent layers of isolation:

| Layer | Mechanism |
|---|---|
| Hardware | KVM hypervisor boundary; each VM has its own kernel |
| Process | Firecracker Jailer with chroot, seccomp filters and a dedicated UID/GID |
| Resources | cgroup v2 limits on CPU, memory, process count and file descriptors |
| Filesystem | Read-only root filesystem with a 512 MB tmpfs workspace |
| Network | Per-VM namespace with NAT, egress rules, reverse-path filtering, IPv6 dropped by default, and the cloud metadata endpoint (`169.254.169.254`) blocked |
| Host channel | vsock only; no shared memory or shared filesystem |

The threat model and network packet path are documented in [docs/RELEASE.md](docs/RELEASE.md#architecture--security). Please report security vulnerabilities privately to the maintainer (contact details at [willx.tech](https://willx.tech)) rather than in public issues.

## Performance

Reference host: Ubuntu 24.04, Linux 6.17, Intel Core i5-11400H, 7.45 GB RAM, Firecracker 1.16.0-dev, Node.js 20.19.5.

| Metric | p50 | p95 | Mean |
|---|---|---|---|
| Cold start (total) | 90.6 ms | 104.8 ms | 91.8 ms |
| Snapshot restore | 2.59 ms | 3.77 ms | 2.77 ms |
| Network setup | 55.3 ms | 75.9 ms | 58.8 ms |
| Warm message round trip | 1.48 ms | 9.42 ms | 2.29 ms |
| VM cleanup | 7.53 ms | 8.45 ms | 7.78 ms |

To reproduce, run `sudo npm run bench` in the `backend` directory.

## Development

```bash
cd backend
npm ci
npm run build          # Type-check and compile
npm test               # Unit and integration tests (Vitest)
npm run test:coverage  # Tests with coverage report
sudo npm run test:e2e  # End-to-end VM tests (requires root, KVM and Firecracker)
```

Continuous integration runs the backend and website test suites on every push and pull request.

To work on the website:

```bash
cd NewFrontend
npm ci
npm run dev
```

## Repository Layout

| Path | Contents |
|---|---|
| [`backend/src`](backend/src) | Server: REST routes, authentication, session management, VM lifecycle, networking, MCP server, benchmarks |
| [`backend/sdk/typescript`](backend/sdk/typescript) | TypeScript client SDK |
| [`backend/templates`](backend/templates) | Dockerfiles and build script for the base, Node.js, Python and Go templates |
| [`backend/minimal-rootfs`](backend/minimal-rootfs) | Guest init script and in-VM runtime agent |
| [`NewFrontend`](NewFrontend) | Project website (Astro), deployed to Vercel |
| [`docs`](docs) | Release documentation: installation, deployment, API reference, troubleshooting |

## Contributing

Contributions are welcome. Please read [backend/CONTRIBUTING.md](backend/CONTRIBUTING.md) before opening a pull request. In summary:

1. Fork the repository and create a branch from `main`.
2. Add tests for any change in behavior.
3. Confirm that `npm test` and `npm run build` pass.
4. Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.
5. Open a pull request against `main`.

Bugs and feature requests can be filed as [GitHub issues](https://github.com/SheerWill007/Agent-Sandbox/issues).

## License

Agent Sandbox is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only). If you run a modified version of this software as a network service, you must make the complete corresponding source code available to its users under the same license.

## Author

William Law (Vivek Jadhav)
[willx.tech](https://willx.tech) · [GitHub](https://github.com/SheerWill007)

## Acknowledgments

Agent Sandbox builds on [Firecracker](https://github.com/firecracker-microvm/firecracker) (Amazon Web Services), [Node.js](https://nodejs.org), [Express](https://expressjs.com), [Vitest](https://vitest.dev), [Pino](https://getpino.io) and [prom-client](https://github.com/siimon/prom-client).
