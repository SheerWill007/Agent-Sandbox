# Agent Sandbox

An isolated execution environment for AI agents built on Firecracker microVMs.

Agent Sandbox gives every AI agent session its own dedicated Linux machine. Code runs, packages install, files are read and written, processes spawn, and networks are accessed — all inside a hardware-isolated microVM that boots in under 100 milliseconds and is permanently destroyed when the session ends.

---

## Table of Contents

- [Why This Exists](#why-this-exists)
- [Architecture](#architecture)
- [How It Works](#how-it-works)
- [Capabilities](#capabilities)
- [Environment Templates](#environment-templates)
- [Interfaces](#interfaces)
  - [TypeScript SDK](#typescript-sdk)
  - [REST API](#rest-api)
  - [MCP Server](#mcp-server)
- [Isolation Model](#isolation-model)
- [Security Model and Trust Boundaries](#security-model-and-trust-boundaries)
- [Authentication and Key Management](#authentication-and-key-management)
- [Getting Started](#getting-started)
- [Configuration Reference](#configuration-reference)
- [Observability](#observability)
- [Testing](#testing)
- [Performance and Benchmarks](#performance-and-benchmarks)
- [Project Structure](#project-structure)
- [Technology Stack](#technology-stack)
- [Known Limitations](#known-limitations)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)
- [Author](#author)

---

## Why This Exists

AI agents need to act: they write code and execute it, install libraries, call external services, manage files, and spawn background processes. Running agent-generated code on a host machine is unpredictable, potentially destructive, and cannot be adequately contained with containers alone because containers share the host kernel.

**Agent Sandbox** provides each agent session with a dedicated Firecracker microVM:

- **Hardware-level isolation.** Each session runs its own Linux kernel. A misbehaving or adversarial agent cannot escape to the host or interfere with other sessions.
- **Millisecond restore times.** Pre-snapshotted VM state is restored in 1 to 5 milliseconds. The total end-to-end cold start, including network namespace provisioning, veth pair creation, TAP device setup, and iptables egress chain configuration, is approximately 90 milliseconds at the 50th percentile.
- **A complete Linux environment.** Agents receive a real filesystem, a full process table, and a network stack with outbound internet access.
- **Pre-built and custom environments.** Sessions can be provisioned with pre-baked Node.js, Python, Go, or custom Dockerfile environments.
- **Ephemeral by design.** Sessions are stateless, time-bounded, and automatically reclaimed. No persistent state leaks between sessions.

---

## Architecture

```
+---------------------------------------------------------------+
|                     Host (Linux + KVM)                        |
|                                                               |
|  +---------------+   +----------------+   +---------------+  |
|  |  Express API  |   |   MCP Server   |   |   Prometheus  |  |
|  |  /exec/*      |   |  stdio / SSE   |   |   /metrics    |  |
|  +-------+-------+   +-------+--------+   +---------------+  |
|          |                   |                               |
|          +----------+--------+                               |
|                     |                                        |
|            +--------+--------+   +-------------------------+ |
|            |  Session Gateway |-->|   Template Registry     | |
|            |  (lazy VM alloc) |   | (node, python, go, ...) | |
|            +--------+--------+   +-------------------------+ |
|                     |                                        |
|         +-----------+-----------+                            |
|         |       VM Manager      |                            |
|         |  jailer + snapshot    |                            |
|         |  restore + lifecycle  |                            |
|         +-----------+-----------+                            |
|                     |                                        |
|   +-----------------+---------------------------+            |
|   |      Per-VM Linux Network Namespace         |            |
|   |  veth pair -- TAP device -- NAT/iptables    |            |
|   +-----------------+---------------------------+            |
|                     | vsock                                  |
|   +=================+===============================+        |
|   ||          Firecracker microVM                  ||        |
|   ||                                               ||        |
|   ||   +--------------+     +------------------+  ||        |
|   ||   |  runtime.js  |---->|   /workspace     |  ||        |
|   ||   |  (Node.js)   |     |   (tmpfs 512 MB) |  ||        |
|   ||   +--------------+     +------------------+  ||        |
|   ||         |                                    ||        |
|   ||   socat <--> vsock:5000                      ||        |
|   +================================================+        |
+---------------------------------------------------------------+
```

---

## How It Works

1. A session request arrives via the REST API, the MCP protocol, or the client SDK. The request optionally specifies a `template` (for example, `node`, `python`, or `go`).

2. The **Session Gateway** resolves the template from the **Template Registry** and performs a lazy VM creation by restoring a pre-snapshotted Firecracker instance. Snapshot restoration itself takes approximately 1 to 5 milliseconds.

3. Each VM is placed inside a dedicated **Linux network namespace** with a private veth pair, TAP device, and NAT rules. The guest receives full outbound internet access while remaining isolated from other VMs and the host network stack.

4. Commands are delivered to the guest **runtime** over a **vsock** channel. The runtime is a small Node.js server that executes processes, manages the filesystem, and streams results back over the same channel.

5. When a session has been idle for 30 minutes (configurable), or when explicitly destroyed, the session reaper tears down the VM, removes the jail directory, and reclaims the network namespace. On process restart, an orphan sweep recovers any resources that were not cleaned up during an unclean shutdown.

### Network Packet Path

```
MicroVM guest (eth0: 192.168.241.2/29)
    |
tap0 (192.168.241.1/29) -- inside per-VM network namespace
    |
Per-namespace iptables:
  PREROUTING:  transparent DNS redirect (UDP/TCP 53 -> local dnsmasq)
  FORWARD VM_EGRESS:  cloud metadata drop (169.254.169.254/32) + optional CIDR rules
  POSTROUTING: MASQUERADE 192.168.241.0/29 -> vethNs
    |
vethNs (10.0.{slot}.1/30) -- inside namespace
    | veth pair across namespace boundary
vethHost (10.0.{slot}.2/30) -- on host
    |
Host-level iptables:
  INPUT:      DROP new connections from 10.0.0.0/16 to host daemon ports
  FORWARD:    DROP 169.254.169.254/32 (defense-in-depth cloud metadata block)
  FORWARD:    DROP 10.0.0.0/16 -> 10.0.0.0/16 (cross-tenant isolation)
  FORWARD:    ACCEPT 10.0.0.0/16 outbound + conntrack return traffic
  POSTROUTING: MASQUERADE 10.0.0.0/16 -> physical WAN interface
    |
Internet
```

---

## Capabilities

Each agent session provides the following capabilities:

| Capability | Details |
|---|---|
| Multiple environments | Pre-built snapshots for Node.js, Python, Go, and custom Dockerfiles |
| Command execution | Any binary: `node`, `python3`, `go`, `sh`, `curl`, and others. Stdout and stderr are streamed in real time |
| Filesystem access | Read, write, and list files within the isolated `/workspace` tmpfs |
| Package installation | Full network access — `npm install`, `pip install`, `go get` all work |
| Process management | Per-command timeouts, cancellation via SIGTERM and SIGKILL, exit code tracking |
| Network access | Private network stack per VM with DNS, outbound HTTP and HTTPS, and NAT egress |
| Session persistence | Workspace state persists across all commands within a single session |

---

## Environment Templates

Agent Sandbox uses pre-snapshotted environment templates. Each environment boots in milliseconds because the filesystem and process state are restored from a snapshot rather than booted from scratch.

### Built-in Templates

| Name | Base | Included Tools |
|---|---|---|
| `node` (default) | Alpine 3.20 | Node.js 22, npm, pnpm, git, curl |
| `python` | Alpine 3.20 | Python 3.12, pip, git, curl |
| `go` | Alpine 3.20 | Go 1.23, git, curl |

### Building Templates

The included build pipeline script generates environment snapshots from Dockerfiles:

```bash
sudo ./templates/build.sh node
sudo ./templates/build.sh python
sudo ./templates/build.sh go
```

### Custom Environment Templates

Define a custom environment by creating a directory under `templates/<name>/` with a `Dockerfile` that extends the base image:

```dockerfile
FROM agent-sandbox-base:latest

RUN apk add --no-cache ruby rust cargo postgresql-client

LABEL template.name="data-science" \
      template.displayName="Data Science" \
      template.tools="ruby,rustc,cargo,psql"
```

Generate the snapshot:

```bash
sudo ./templates/build.sh data-science
```

The build pipeline:
1. Builds a Docker image from the Dockerfile.
2. Extracts the filesystem into a 1 GB ext4 rootfs image.
3. Provisions a Firecracker jail, boots the guest until it signals `READY`, and takes a full VM snapshot.
4. Writes the snapshot state, memory image, rootfs, and `template.json` metadata to `/var/lib/agent-sandbox/artifacts/templates/<name>/`.

---

## Interfaces

Agent Sandbox exposes three integration layers.

### TypeScript SDK

Install from the workspace:

```bash
npm install ./sdk/typescript
```

```typescript
import { Sandbox } from "@agent-sandbox/sdk";

const sandbox = new Sandbox({
  baseUrl: "http://localhost:3000",
  apiKey: process.env.SANDBOX_API_KEY,
});

// Create a session with a specific template
const session = sandbox.create({ template: "python" });

// Execute code using the session's default runtime
const result = await session.runCode("print(2 + 2)");
console.log(result.output[0].data); // "4\n"

// Stream output in real time
for await (const chunk of session.execStream("npm", { args: ["test"] })) {
  if (chunk.type === "stream") process.stdout.write(chunk.data);
}

// Filesystem operations
await session.writeFile("data.json", JSON.stringify({ key: "value" }));
const { content } = await session.readFile("data.json");

// Clean up
await session.destroy();
```

See [sdk/typescript/README.md](sdk/typescript/README.md) for the full API reference.

### REST API

All endpoints are prefixed with `/exec` and require an `Authorization: Bearer <key>` header.

```bash
# List available environment templates
curl -H "Authorization: Bearer $KEY" http://localhost:3000/exec/templates

# Execute a command in a session
curl -X POST http://localhost:3000/exec/session-1/execute \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"command":"python3","args":["-c","print(\"hello\")"],"template":"python"}'

# Stream output as NDJSON
curl -X POST http://localhost:3000/exec/session-1/execute \
  -H "Authorization: Bearer $KEY" \
  -H "Accept: application/x-ndjson" \
  -H "Content-Type: application/json" \
  -d '{"command":"npm","args":["test"]}'

# Write a file
curl -X POST http://localhost:3000/exec/session-1/write \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"path":"main.py","content":"print(\"hello\")"}'

# Read a file
curl -H "Authorization: Bearer $KEY" \
  "http://localhost:3000/exec/session-1/read?path=main.py"

# List workspace files
curl -H "Authorization: Bearer $KEY" \
  "http://localhost:3000/exec/session-1/files?recursive=true"

# Destroy a session
curl -X DELETE -H "Authorization: Bearer $KEY" \
  http://localhost:3000/exec/session-1

# List all active sessions
curl -H "Authorization: Bearer $KEY" http://localhost:3000/exec/
```

### MCP Server

An MCP server that connects any MCP-compatible agent directly to Agent Sandbox:

| Tool | Description |
|---|---|
| `create_session` | Provision a new isolated session (optional `template` parameter) |
| `list_templates` | List available environment templates |
| `execute` | Run a command inside the session's VM |
| `write_file` | Write content to the session workspace |
| `read_file` | Read a file from the session workspace |
| `list_files` | List workspace directory contents |
| `reset_session` | Destroy a session and release all resources |
| `ping` | Liveness check |

**Transports:**

- **SSE** — HTTP with Bearer token authentication at `/mcp`
- **stdio** — local MCP server via `npm run mcp`

```json
{
  "mcpServers": {
    "agent-sandbox": {
      "command": "node",
      "args": ["dist/mcp/stdio.js"]
    }
  }
}
```

---

## Isolation Model

Every session receives defense-in-depth isolation across multiple layers:

| Layer | Mechanism |
|---|---|
| Compute | Dedicated Firecracker microVM with its own Linux kernel |
| Filesystem | Read-only ext4 rootfs with an isolated 512 MB tmpfs workspace mount |
| Network | Per-VM Linux network namespace with veth pair, TAP device, NAT, IPv4 egress chains, and IPv6 DROP |
| Process | Firecracker Jailer: chroot with 0o750 permissions, dedicated UID/GID separation, default seccomp filter |
| Resources | Host cgroup limits: CPU quota and period, memory maximum, `pids.max` fork-bomb protection, file descriptor limits |
| Lifecycle | Automatic reaping of idle sessions (default 30-minute TTL) and startup orphan recovery |
| Access control | Path traversal prevention on all file and workspace operations |

### Security Hardening Details

**Fork-bomb mitigation.** Each microVM jail applies `pids.max=256` via cgroups v2 or v1 to prevent hostile code from exhausting host PID tables.

**Strict permission verification.** Chroot directories enforce 0o750 permissions and ownership by the dedicated unprivileged `firecracker` UID/GID. Setting `STRICT_PERMISSIONS=true` or running in `NODE_ENV=production` causes any permission failure to halt execution rather than fall back silently.

**IPv6 containment.** Inside per-VM network namespaces, IPv6 traffic is dropped by default (`ip6tables -P DROP`) to prevent uninspected IPv6 egress that could bypass IPv4 egress policy rules.

**Header-only authentication.** API keys are accepted strictly via the `Authorization: Bearer` HTTP header. Query parameter authentication is rejected to prevent credential leakage into server access logs, URL histories, and referrer headers.

**Cloud metadata protection.** The IMDS endpoint `169.254.169.254/32` is dropped at both the per-VM namespace egress chain and the host FORWARD chain as a defense-in-depth measure.

---

## Security Model and Trust Boundaries

```
+---------------------------------------------------------------+
|  TRUSTED: Host Infrastructure                                 |
|  - KVM hypervisor kernel module                               |
|  - Express HTTP and MCP control plane                         |
|  - Linux network namespaces, veth routing, host iptables      |
+----------------------------+----------------------------------+
                             |
             Virtualization boundary (KVM / virtio)
                             |
+----------------------------v----------------------------------+
|  SEMI-TRUSTED: Firecracker VMM                                |
|  - Jailer chroot (0o750 permissions, unprivileged UID/GID)    |
|  - Seccomp syscall filtering                                  |
|  - Cgroup v2 limits (CPU quota, memory max, pids.max=256)     |
+----------------------------+----------------------------------+
                             |
                vsock IPC / isolated netns
                             |
+----------------------------v----------------------------------+
|  UNTRUSTED: MicroVM Guest and Executed Code                   |
|  - Guest Linux kernel and agent processes                     |
|  - /workspace (tmpfs 512 MB RAM disk)                         |
|  - Egress network traffic (subject to DNS/IP/port filters)    |
+---------------------------------------------------------------+
```

### Threat Mitigations

| Threat | Mitigation | Implementation |
|---|---|---|
| Host escape | Hardware-assisted virtualization + Jailer confinement | KVM boundary, unprivileged UID/GID, chroot, default seccomp |
| IP spoofing | RFC 3704 Reverse Path Filtering | `net.ipv4.conf.tap0.rp_filter=2` inside every network namespace |
| Host port scanning | Host-level firewall | `iptables -I INPUT -s 10.0.0.0/16 -j DROP` |
| Cloud metadata theft | IMDS endpoint blocking | `169.254.169.254/32` dropped at namespace egress and host FORWARD |
| DNS bypass | Transparent DNS interception | `PREROUTING REDIRECT` on port 53 to local `dnsmasq`; direct port-53 egress is dropped |
| Fork bombs and OOM | Kernel cgroup resource limits | `pids.max=256`, `memory.max=128MB`, CPU quota throttling |
| Cross-tenant hijack | Scoped API keys and session ownership | Ownership verification on all REST, MCP, and destroy operations |
| Path traversal | Normalized path boundary validation | `isInsideWorkspace` validates all file operations against `/workspace` |
| Credential leakage | Header-only authentication | Query parameter keys are rejected at the middleware layer |

### Known Limitations

- **Single-host control plane.** Session state is managed in process memory on each host. Horizontal clustering requires an external coordinator such as etcd or Redis.
- **DNS-over-HTTPS bypass.** Direct DNS egress on port 53 is blocked and intercepted, but applications initiating TLS connections to DoH resolvers on port 443 can bypass DNS-level filtering unless destination IP allowlisting (`VM_DEST_MODE=allow`) is configured.
- **Shell-based network provisioning.** Network setup invokes `ip`, `iptables`, and `tc` via child processes. Replacing these with direct Netlink syscall bindings would reduce setup latency and eliminate any residual shell injection surface.

---

## Authentication and Key Management

Agent Sandbox uses API key authentication with scope-based access control and per-key rate limiting.

**Scopes:**

| Scope | Grants access to |
|---|---|
| `exec` | Session creation, command execution, file operations |
| `admin` | API key management |
| `metrics` | Prometheus metrics endpoint |

### Managing Keys

```bash
# Create a key with the default exec scope
npm run keys create "my-agent-key"

# Create an admin key with custom rate limit (requests per minute)
npm run keys create "admin-key" --scopes exec,admin,metrics --rate-limit 100

# List all keys
npm run keys list

# Rotate a key (disables old key, creates new one with same settings)
npm run keys rotate <key-id>

# Revoke a key (disables it, retains record)
npm run keys revoke <key-id>

# Permanently delete a key
npm run keys delete <key-id>
```

### Authentication Usage

```bash
# Standard Authorization header
curl -H "Authorization: Bearer sk_test_..." http://localhost:3000/exec/templates
```

```typescript
import { Sandbox } from "@agent-sandbox/sdk";

const sandbox = new Sandbox({
  apiKey: process.env.SANDBOX_API_KEY,
});
```

---

## Getting Started

### Prerequisites

- Linux host with KVM support (`/dev/kvm` must be accessible)
- [Firecracker](https://github.com/firecracker-microvm/firecracker) and Jailer binaries
- Node.js v20.12 or later
- Docker (required for template build pipeline)
- Root access (required for Jailer, network namespaces, and iptables)

### Install Firecracker and Jailer

```bash
ARCH="$(uname -m)"
release_url="https://github.com/firecracker-microvm/firecracker/releases"
latest=$(basename $(curl -fsSLI -o /dev/null -w %{url_effective} ${release_url}/latest))

curl -L ${release_url}/download/${latest}/firecracker-${latest}-${ARCH}.tgz | tar -xz

sudo mv release-${latest}-${ARCH}/firecracker-${latest}-${ARCH} /usr/local/bin/firecracker
sudo mv release-${latest}-${ARCH}/jailer-${latest}-${ARCH} /usr/local/bin/jailer

firecracker --version
```

### Create the Firecracker System User

The Jailer runs Firecracker processes under a dedicated unprivileged user:

```bash
sudo groupadd -g 982 firecracker 2>/dev/null || true
sudo useradd -u 997 -g 982 -M -s /usr/sbin/nologin firecracker 2>/dev/null || true
```

The default UID (997) and GID (982) can be overridden via the `FIRECRACKER_UID` and `FIRECRACKER_GID` environment variables.

### Enable IP Forwarding

```bash
sudo sysctl -w net.ipv4.ip_forward=1
echo "net.ipv4.ip_forward = 1" | sudo tee /etc/sysctl.d/99-ip-forward.conf
```

### Install

```bash
git clone https://github.com/SheerWill007/Agent-Sandbox.git
cd Agent-Sandbox
npm install
```

### Download the Kernel Artifact

```bash
sudo mkdir -p /var/lib/agent-sandbox/artifacts
wget https://github.com/SheerWill007/Agent-Sandbox/releases/download/Beta/vmlinux
sudo mv vmlinux /var/lib/agent-sandbox/artifacts/
sudo chown -R root:firecracker /var/lib/agent-sandbox/artifacts
sudo chmod 750 /var/lib/agent-sandbox/artifacts
```

### Build Template Snapshots

```bash
sudo ./templates/build.sh node
sudo ./templates/build.sh python
sudo ./templates/build.sh go
```

### Create an API Key

```bash
npm run keys create "default-key"
# Save the printed key value; it cannot be retrieved again
```

### Start the Server

```bash
sudo npm start
# Listening on http://localhost:3000
```

### Verify

```bash
# Health check
curl http://localhost:3000/health

# List templates (requires API key)
curl -H "Authorization: Bearer <key>" http://localhost:3000/exec/templates

# Execute a command
curl -X POST http://localhost:3000/exec/test-session/execute \
  -H "Authorization: Bearer <key>" \
  -H "Content-Type: application/json" \
  -d '{"template":"python","command":"python3","args":["--version"]}'
```

---

## Configuration Reference

All configuration is supplied via environment variables. The `example.env` file in the repository root documents all available options.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `LOG_LEVEL` | `debug` | Pino log level (`silent`, `debug`, `info`, `warn`, `error`) |
| `AUTH_ENABLED` | *(true unless `"false"`)* | Set to `"false"` to disable API key authentication (development only) |
| `AUTH_KEYS_PATH` | `/var/lib/agent-sandbox/keys.json` | Path to the API keys store |
| `AUTH_KEY_PREFIX` | `sk_test_` | Prefix prepended to generated API key values |
| `MCP_AUTH_TOKEN` | *(required for MCP SSE)* | Bearer token for the MCP SSE endpoint |
| `FIRECRACKER_BIN` | `/usr/local/bin/firecracker` | Path to the Firecracker binary |
| `FIRECRACKER_JAILER_BIN` | `/usr/local/bin/jailer` | Path to the Jailer binary |
| `FIRECRACKER_JAIL_BASE` | `/var/lib/agent-sandbox/jailer` | Base directory for Jailer chroots |
| `FIRECRACKER_ARTIFACTS_DIR` | `/var/lib/agent-sandbox/artifacts` | Snapshot, memory, kernel, and template storage |
| `FIRECRACKER_UID` | `997` | UID for Firecracker processes |
| `FIRECRACKER_GID` | `982` | GID for Firecracker processes |
| `VM_VCPU_COUNT` | `1` | Number of vCPUs per guest VM |
| `VM_MEM_SIZE_MIB` | `128` | Guest RAM in MiB (must match snapshot configuration) |
| `VM_CPU_QUOTA_US` | `50000` | CPU quota in microseconds for the cgroup bandwidth controller |
| `VM_CPU_PERIOD_US` | `100000` | CPU period in microseconds |
| `VM_MEMORY_LIMIT_BYTES` | `134217728` | Host cgroup memory limit in bytes (128 MiB) |
| `VM_NOFILE_LIMIT` | `1024` | Maximum open file descriptors per VM process |
| `VM_PIDS_LIMIT` | `256` | Maximum process count inside the jail cgroup |
| `VM_MAX_SLOTS` | `254` | Maximum number of concurrent VMs |
| `STRICT_PERMISSIONS` | `false` | Halt on jail permission failures (auto-enabled in production) |
| `VM_DNS_MODE` | `none` | Per-VM DNS filtering mode: `none`, `allow`, or `deny` |
| `VM_DNS_DOMAINS` | *(empty)* | Comma-separated domain filter list (e.g. `*.npmjs.org,github.com`) |
| `VM_DNS_UPSTREAM` | `8.8.8.8,1.1.1.1` | Upstream DNS servers for dnsmasq |
| `VM_DEST_MODE` | `none` | Per-VM IP/port destination filtering mode: `none`, `allow`, or `deny` |
| `VM_DEST_RULES` | *(empty)* | Destination CIDR/port rules (e.g. `169.254.169.254/32,10.0.0.0/8:443/tcp`) |
| `VM_BW_ENABLED` | `false` | Enable TC bandwidth throttling per VM |
| `VM_BW_RATE_KBIT` | `10240` | Rate limit in kbit/s (10240 = 10 Mbit/s) |
| `VM_BW_BURST_KBIT` | `1024` | Burst allowance in kbit |
| `SESSION_TTL_MS` | `1800000` | Session idle timeout in milliseconds (30 minutes) |
| `SESSION_MANIFEST_PATH` | `/var/lib/agent-sandbox/sessions.json` | Session persistence manifest for orphan recovery |

---

## Observability

### Prometheus Metrics

All metrics are exposed at `GET /metrics` and require the `metrics` scope.

| Metric | Type | Description |
|---|---|---|
| `active_vm_count` | Gauge | Running VMs by state |
| `vm_creation_time` | Histogram | Snapshot restore and VM provisioning latency |
| `total_vm_created` | Counter | VMs created, labeled by status (`success` or `error`) |
| `total_vm_cleanups` | Counter | VMs cleaned up |
| `exec_sessions_active` | Gauge | Currently active agent sessions |
| `exec_session_duration_seconds` | Histogram | Session lifetimes |
| `exec_message_total` | Counter | Messages by type and status |
| `exec_message_duration_seconds` | Histogram | Round-trip time per message type |
| `exec_process_exit_code` | Counter | Exit codes by command |
| `exec_workspace_bytes_written` | Counter | Bytes written to workspace |
| `vsock_connection_time` | Histogram | Host-to-VM vsock connection latency |
| `vsock_errors_total` | Counter | Connection, parse, and timeout errors |
| `vm_resource_config` | Gauge | Configured resource limits per VM |
| `vm_egress_policy_applied_total` | Counter | Applied network egress policies |
| `vm_template_usage_total` | Counter | Template usage by name |
| `vm_slot_capacity` | Gauge | Used and available network slots |
| `auth_requests_total` | Counter | Authentication results by outcome |
| `auth_rate_limit_hits_total` | Counter | Rate limit violations by key ID |
| `http_request_duration` | Histogram | HTTP request latency by method, route, and status |
| `total_http_requests` | Counter | Total HTTP requests |

### Additional Endpoints

- `GET /health` — Basic liveness check. Returns `{ "status": "ok", "uptime": <seconds> }`.
- `GET /ready` — Readiness probe. Returns 503 if heap usage exceeds 500 MB.

---

## Testing

```bash
# Run all unit and integration tests (22 suites, 200+ tests)
npm test

# Run with coverage report
npm run test:coverage

# Watch mode during development
npm run test:watch

# Run the real Firecracker end-to-end test (requires Linux, KVM, and root)
sudo npm run test:e2e
```

Test coverage spans: session gateway and lifecycle, VM protocol and vsock transport, Jailer path handling and argument generation, cleanup and orphan recovery, network slot allocation, egress policy parsing, template registry discovery and validation, MCP tool behavior, REST API input validation and response formatting, authentication middleware and key store, rate limiting, and ownership enforcement.

---

## Performance and Benchmarks

Agent Sandbox ships a benchmarking harness (`npm run bench`) with microsecond-accurate timing across four subsystems.

```bash
# Run all suites with default settings (10 iterations, concurrency 1/5/10)
sudo npm run bench

# Run a specific suite
sudo npm run bench -- -s vm -i 20
sudo npm run bench -- -s gateway -c 1,5,10,20
```

### Reference Environment

- OS: Ubuntu 24.04.3 LTS (Linux 6.17.0-40-generic)
- CPU: Intel Core i5-11400H 2.70 GHz, 6 cores / 12 threads
- RAM: 7.45 GiB
- Virtualization: Linux KVM + Firecracker v1.16.0-dev
- Runtime: Node.js v20.19.5

### VM Lifecycle (Cold Start)

| Operation | p50 | p95 | Mean | StdDev |
|---|---|---|---|---|
| network_setup | 55.3 ms | 75.9 ms | 58.8 ms | 7.01 ms |
| jail_setup | 0.20 ms | 0.27 ms | 0.22 ms | 32.3 us |
| jailer_spawn | 0.76 ms | 0.79 ms | 0.76 ms | 16.7 us |
| api_socket_ready | 14.24 ms | 19.2 ms | 13.92 ms | 3.44 ms |
| snapshot_restore | 2.59 ms | 3.77 ms | 2.77 ms | 0.49 ms |
| vsock_connect | 0.11 ms | 0.17 ms | 0.13 ms | 25.1 us |
| first_message_rtt | 15.3 ms | 15.5 ms | 15.1 ms | 0.41 ms |
| warm_message_rtt | 1.48 ms | 9.42 ms | 2.29 ms | 2.38 ms |
| **TOTAL_COLD_START** | **90.6 ms** | **104.8 ms** | **91.8 ms** | **6.39 ms** |

Snapshot restoration accounts for approximately 2.59 ms of the total cold start. The dominant cost is Linux network namespace setup at approximately 55 ms. Replacing shell-invoked `ip` commands with direct Netlink bindings is the primary optimization path toward sub-20 ms cold starts.

### Networking Breakdown

| Operation | p50 | p95 | Mean |
|---|---|---|---|
| netns_create | 2.45 ms | 2.99 ms | 2.51 ms |
| veth_pair_and_ip | 35.7 ms | 42.7 ms | 36.2 ms |
| tap_device_setup | 6.50 ms | 6.59 ms | 6.50 ms |
| sysctl_config | 5.47 ms | 5.75 ms | 5.52 ms |
| iptables_egress_chain | 12.56 ms | 13.51 ms | 12.68 ms |
| dns_filtering_setup | 2.21 ms | 2.52 ms | 2.26 ms |
| tc_bandwidth_setup | 4.46 ms | 4.64 ms | 4.48 ms |
| full_setupVmNetwork | 53.7 ms | 69.4 ms | 56.4 ms |
| full_teardownVmNetwork | 17.0 ms | 30.4 ms | 19.2 ms |

### Session Gateway and Concurrency

| Operation | p50 | p95 | Mean |
|---|---|---|---|
| cold_session_start | 91.6 ms | 114.5 ms | 94.8 ms |
| warm_session_message | 1.54 ms | 1.90 ms | 1.63 ms |
| file_write_roundtrip | 1.07 ms | 1.54 ms | 1.12 ms |
| file_read_roundtrip | 0.54 ms | 0.64 ms | 0.56 ms |
| concurrent_burst_1 (1 VM) | 98.1 ms | 109.5 ms | 97.4 ms |
| concurrent_burst_5 (5 VMs) | 209.5 ms | 246.1 ms | 217.9 ms |
| concurrent_burst_10 (10 VMs) | 401.4 ms | 469.0 ms | 411.8 ms |

### Cleanup and Teardown

| Operation | p50 | p95 | Mean |
|---|---|---|---|
| fc_process_kill | 11.8 us | 19.4 us | 12.6 us |
| jail_directory_rmrf | 0.43 ms | 0.71 ms | 0.48 ms |
| network_teardown | 27.8 ms | 39.0 ms | 25.7 ms |
| full_cleanupVm | 7.53 ms | 8.45 ms | 7.78 ms |

---

## Project Structure

```
src/
├── server.ts              Entry point: startup, orphan sweep, network init, HTTP server
├── app.ts                 Express app: routes, middleware, metrics, session reaper
├── logger.ts              Structured logging (Pino) with PII redaction
├── metrics.ts             Prometheus metric definitions
├── create_snapshot.ts     CLI and library for creating VM template snapshots
├── shutdown.ts            Graceful shutdown on SIGTERM/SIGINT
├── auth/
│   ├── cli.ts             Key management CLI
│   ├── key-store.ts       In-memory and disk-backed API key store
│   ├── middleware.ts       Authentication middleware factory
│   ├── ownership.ts       Session ownership enforcement
│   └── rate-limiter.ts    Fixed-window per-key rate limiter
├── session/
│   ├── gateway.ts         Session dispatch: lazy VM creation, message routing
│   ├── manifest.ts        Session persistence for orphan recovery
│   └── session.ts         In-memory session registry and reaper
├── vm/
│   ├── cleanup.ts         Idempotent VM teardown
│   ├── egress-policy.ts   Egress policy types and environment variable loading
│   ├── jailer.ts          Jailer configuration: args, paths, permissions, cgroups
│   ├── networking.ts      Linux network namespace provisioning and teardown
│   ├── orphan-sweep.ts    Startup cleanup of resources from previous runs
│   ├── protocol.ts        Vsock response parsing and stream dispatch
│   ├── templates.ts       Template registry: discovery, validation, metadata
│   ├── transport.ts       Vsock connection management and per-VM locking
│   └── vm-manager.ts      VM lifecycle: create, restore, snapshot
├── routes/
│   ├── admin.ts           REST API for key management
│   └── exec.ts            REST API for session execution
├── mcp/
│   ├── routes.ts          SSE transport and authentication for MCP
│   ├── server.ts          MCP tool definitions and handlers
│   └── stdio.ts           Stdio transport entry point
└── bench/
    ├── harness.ts         Benchmark timing, statistics, and output formatting
    ├── index.ts           CLI entry point for the benchmark suite
    └── suites/            Individual benchmark suite implementations

sdk/
└── typescript/
    ├── src/
    │   ├── client.ts      Sandbox client: session factory and admin operations
    │   ├── index.ts       Public API barrel export
    │   ├── session.ts     Session handle: exec, runCode, filesystem
    │   └── types.ts       All public type definitions
    └── README.md          SDK API reference

templates/
├── build.sh               Build pipeline: Docker -> ext4 rootfs -> Firecracker snapshot
├── base/Dockerfile        Minimal guest base image
├── node/Dockerfile        Node.js environment
├── python/Dockerfile      Python 3.12 environment
└── go/Dockerfile          Go 1.23 environment

minimal-rootfs/
├── start.sh               Guest init: network config, runtime startup, vsock bridge
└── runtime/runtime.js     Guest-side agent runtime: execute, filesystem, cancel
```

---

## Technology Stack

| Component | Technology |
|---|---|
| Execution engine | [Firecracker](https://github.com/firecracker-microvm/firecracker) microVMs |
| Process isolation | [Jailer](https://github.com/firecracker-microvm/firecracker/blob/main/docs/jailer.md) (chroot, seccomp, UID separation) |
| Network isolation | Linux network namespaces, veth pairs, TAP devices, iptables NAT, dnsmasq, tc HTB |
| Host-to-VM IPC | vsock with socat bridge |
| Agent protocol | [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) |
| API framework | Express 5 (Node.js) |
| Client SDK | TypeScript (zero runtime dependencies) |
| Logging | Pino (structured JSON) |
| Metrics | prom-client (Prometheus) |
| Testing | Vitest, Supertest |

---

## Known Limitations

- **Single-node architecture.** Session state lives in process memory. Multi-host deployments require an external session store.
- **Root privileges required.** Jailer, network namespaces, iptables rules, and cgroup configuration require host root access or `CAP_NET_ADMIN`.
- **Ephemeral workspace storage.** The `/workspace` tmpfs is destroyed when the session ends. Cross-session persistence requires explicit export or an attached block device.
- **Network provisioning latency.** Sequential Linux network setup (approximately 55 ms at p50) dominates cold start time. Direct Netlink bindings or pre-warmed namespace pools would reduce this to under 10 ms.
- **In-memory session registry.** On unclean crashes, the startup orphan sweep recovers leaked resources, but in-flight session state is not recovered.
- **Fixed-window rate limiting.** The per-key rate limiter uses fixed 60-second windows, which permits burst traffic of up to 2x the configured limit at window boundaries.
- **DNS-over-HTTPS not filtered.** DoH traffic on port 443 bypasses the DNS interception layer unless destination IP allowlisting is configured via `VM_DEST_MODE=allow`.

---

## Roadmap

- [x] Pre-built environment snapshots (Node.js, Python, Go, custom Dockerfiles)
- [x] TypeScript SDK with zero runtime dependencies
- [x] Per-session resource limits (CPU, memory, disk, network bandwidth)
- [x] Real-time output streaming over HTTP and MCP
- [x] Prometheus metrics and structured logging
- [x] Startup orphan recovery and session persistence
- [ ] Persistent workspace volumes across sessions
- [ ] Multi-host execution with distributed session routing
- [ ] Direct Netlink network provisioning for sub-10ms cold starts
- [ ] Sliding-window or token-bucket rate limiting
- [ ] OpenAPI specification and generated client documentation
- [ ] SDK packages for Python and Go

---

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for development setup instructions, coding standards, commit message conventions, and the pull request process.

---

## License

This project is licensed under the GNU Affero General Public License version 3 (AGPL-3.0-only).

You are free to use, study, modify, and distribute this software under the terms of the AGPL-3.0. If you run a modified version of this software as a network service, you must make the complete corresponding source code available to users of that service under the same license.

See the [LICENSE](LICENSE) file for the full license text.

---

## Author

**William Law**

- Website: [willx.tech](https://willx.tech)
- GitHub: [github.com/SheerWill007](https://github.com/SheerWill007)
- Repository: [github.com/SheerWill007/Agent-Sandbox](https://github.com/SheerWill007/Agent-Sandbox)
