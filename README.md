# Agent Sandbox

> **Hardware-isolated execution environment for AI agents built on Firecracker microVMs**

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](LICENSE)
[![GitHub](https://img.shields.io/github/stars/SheerWill007/Agent-Sandbox?style=social)](https://github.com/SheerWill007/Agent-Sandbox)

Agent Sandbox gives every AI agent session its own dedicated Linux machine. Code runs, packages install, files are read and written, processes spawn, and networks are accessed — all inside a hardware-isolated microVM that boots in under 100 milliseconds and is permanently destroyed when the session ends.

---

## 🚀 Quick Links

- **[Landing Page](frontend/index.html)** — Visual overview and feature showcase
- **[Complete Documentation](docs/RELEASE.md)** — Installation, deployment, API reference, troubleshooting
- **[Backend Source](backend/)** — TypeScript/Node.js server, SDK, and MCP implementation
- **[GitHub Repository](https://github.com/SheerWill007/Agent-Sandbox)**

---

## Repository Structure

This repository is organized into three main directories:

### [`backend/`](backend/)
All source code, configuration, and development tooling:
- TypeScript/Node.js server (Express, Firecracker integration)
- TypeScript SDK ([backend/sdk/typescript/](backend/sdk/typescript/))
- MCP server (stdio + SSE transports)
- Environment template build pipeline
- Tests, benchmarks, and CLI tools

### [`frontend/`](frontend/)
Modern landing page built with vanilla HTML, CSS, and JavaScript:
- Dark theme with blue/purple gradients
- Fully responsive design
- Interactive features (FAQ accordion, code copy, smooth scroll)
- **[Open frontend/index.html](frontend/index.html)** in a browser to view

### [`docs/`](docs/)
Comprehensive documentation:
- **[RELEASE.md](docs/RELEASE.md)** — Installation guides, deployment instructions, API documentation, troubleshooting

---

## ⚡ Key Features

- **Hardware-level isolation** — Each session runs its own Linux kernel via KVM
- **~90ms cold boot time** — Snapshot restoration in 1-5ms
- **Multi-language support** — Pre-built Node.js, Python, Go templates + custom Dockerfiles
- **Network isolation** — Per-VM namespace with veth pair, TAP device, and iptables egress rules
- **Three integration interfaces** — TypeScript SDK, REST API, MCP Server
- **Automatic cleanup** — 30-minute idle TTL with ephemeral sessions

---

## 🏃 Quick Start

### Prerequisites

- Linux with KVM support (`/dev/kvm` accessible)
- Node.js v20.12 or later
- Firecracker v1.0+ (with Jailer binary)
- Docker (for template builds)
- Root access

### Installation (3 steps)

```bash
# 1. Install Firecracker and Jailer
ARCH="$(uname -m)"
RELEASE_URL="https://github.com/firecracker-microvm/firecracker/releases"
LATEST=$(basename $(curl -fsSLI -o /dev/null -w %{url_effective} ${RELEASE_URL}/latest))
curl -L ${RELEASE_URL}/download/${LATEST}/firecracker-${LATEST}-${ARCH}.tgz | tar -xz
sudo mv release-${LATEST}-${ARCH}/firecracker-${latest}-${ARCH} /usr/local/bin/firecracker
sudo mv release-${LATEST}-${ARCH}/jailer-${latest}-${ARCH} /usr/local/bin/jailer

# 2. Clone and build
git clone https://github.com/SheerWill007/Agent-Sandbox.git
cd Agent-Sandbox/backend
npm install
npm run build

# 3. Set up environment
sudo sysctl -w net.ipv4.ip_forward=1
sudo groupadd -g 982 firecracker 2>/dev/null || true
sudo useradd -u 997 -g 982 -M -s /usr/sbin/nologin firecracker 2>/dev/null || true
sudo mkdir -p /var/lib/agent-sandbox/artifacts
wget https://github.com/SheerWill007/Agent-Sandbox/releases/download/Beta/vmlinux
sudo mv vmlinux /var/lib/agent-sandbox/artifacts/

# Build templates
cd ..
sudo ./templates/build.sh node
sudo ./templates/build.sh python
sudo ./templates/build.sh go

# Create API key and start
cd backend
npm run keys create "my-key"
sudo npm start
```

### First Execution

```bash
export SANDBOX_API_KEY="sk_test_your_key_here"

curl -X POST http://localhost:3000/exec/test-session/execute \
  -H "Authorization: Bearer $SANDBOX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "template": "python",
    "command": "python3",
    "args": ["-c", "print(\"Hello from isolated VM!\")"]
  }'
```

---

## 📚 Documentation

For full installation instructions, deployment guides, API reference, SDK usage, MCP integration, troubleshooting, and more, see **[docs/RELEASE.md](docs/RELEASE.md)**.

---

## 🛠️ Technology Stack

- **Execution Engine:** Firecracker microVMs with KVM
- **Process Isolation:** Jailer (chroot, seccomp, UID separation)
- **Network Isolation:** Linux network namespaces, veth, TAP, iptables, dnsmasq
- **Host-to-VM IPC:** vsock with socat bridge
- **Agent Protocol:** Model Context Protocol (MCP)
- **Server:** Node.js with Express v5
- **SDK:** TypeScript (zero runtime dependencies)
- **Testing:** Vitest, Supertest
- **Metrics:** Prometheus (prom-client)
- **Logging:** Pino (structured JSON)

---

## 🔒 Security Model

Agent Sandbox provides defense-in-depth isolation:

- **Hardware:** KVM hypervisor boundary
- **Process:** Firecracker Jailer with chroot, seccomp, dedicated UID/GID
- **Compute:** Cgroup v2 limits (CPU quota, memory max, PID limit)
- **Filesystem:** Read-only rootfs + ephemeral tmpfs workspace (512 MB)
- **Network:** Per-VM Linux namespace with NAT, iptables egress rules, cloud metadata blocking (169.254.169.254)
- **IPC:** vsock channel (no shared memory or UNIX sockets)

See [docs/RELEASE.md - Architecture & Security](docs/RELEASE.md#architecture--security) for threat mitigations and network packet path.

---

## 📊 Performance

**Reference Environment:**  
Ubuntu 24.04, Linux 6.17.0, Intel Core i5-11400H, 7.45 GB RAM, Firecracker v1.16.0-dev, Node.js v20.19.5

| Metric | p50 | p95 | Mean |
|---|---|---|---|
| **Cold start (total)** | 90.6 ms | 104.8 ms | 91.8 ms |
| Snapshot restore | 2.59 ms | 3.77 ms | 2.77 ms |
| Network setup | 55.3 ms | 75.9 ms | 58.8 ms |
| Warm message RTT | 1.48 ms | 9.42 ms | 2.29 ms |
| VM cleanup | 7.53 ms | 8.45 ms | 7.78 ms |

Run `sudo npm run bench` in the backend directory for full benchmark results.

---

## 🧪 Testing

```bash
cd backend

# Run all tests (200+ tests, 22 suites)
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch

# End-to-end test (requires root, KVM, and Firecracker)
sudo npm run test:e2e
```

---

## 🤝 Contributing

Contributions are welcome! Please read [backend/CONTRIBUTING.md](backend/CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes and add tests
4. Run tests and linter: `npm test && npm run lint`
5. Commit with conventional message: `git commit -m "feat: add feature"`
6. Push and open a Pull Request

---

## 📝 License

Agent Sandbox is licensed under the **GNU Affero General Public License version 3 (AGPL-3.0-only)**.

You are free to use, study, modify, and distribute this software under the terms of the AGPL-3.0. If you run a modified version of this software as a network service, you must make the complete corresponding source code available to users of that service under the same license.

See the [LICENSE](LICENSE) file for the full license text.

---

## 👤 Author

**William Law (Vivek Jadhav)**

- Website: [willx.tech](https://willx.tech)
- GitHub: [@SheerWill007](https://github.com/SheerWill007)
- Repository: [github.com/SheerWill007/Agent-Sandbox](https://github.com/SheerWill007/Agent-Sandbox)

---

## 🙏 Acknowledgments

Built on top of excellent open-source projects:

- [Firecracker](https://github.com/firecracker-microvm/firecracker) by Amazon Web Services
- [Node.js](https://nodejs.org) by OpenJS Foundation
- [Express](https://expressjs.com) by TJ Holowaychuk
- [Vitest](https://vitest.dev) by Anthony Fu
- [Pino](https://getpino.io) by Matteo Collina

Special thanks to the Firecracker team at AWS for creating a secure, lightweight VMM.

---

**For support, issues, or feature requests, please visit the [GitHub repository](https://github.com/SheerWill007/Agent-Sandbox).**
