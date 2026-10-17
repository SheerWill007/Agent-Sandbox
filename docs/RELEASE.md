# Agent Sandbox v1.0.0 - Release Documentation

**Release Date:** January 2025  
**Project:** Agent Sandbox  
**Repository:** https://github.com/SheerWill007/Agent-Sandbox  
**License:** AGPL-3.0

---

## Table of Contents

- [Project Overview](#project-overview)
- [Release Information](#release-information)
- [System Requirements](#system-requirements)
- [Installation Instructions](#installation-instructions)
  - [Linux (Ubuntu/Debian)](#linux-ubuntudebian)
  - [Linux (RHEL/CentOS/Fedora)](#linux-rhelcentosfedora)
  - [Linux (Arch)](#linux-arch)
  - [Windows (WSL2)](#windows-wsl2)
  - [macOS](#macos)
- [Quick Start Guide](#quick-start-guide)
- [Building from Source](#building-from-source)
- [Deployment Guide](#deployment-guide)
  - [Systemd Service](#systemd-service)
  - [Nginx Reverse Proxy](#nginx-reverse-proxy)
  - [SSL/TLS Configuration](#ssltls-configuration)
  - [Environment Configuration](#environment-configuration)
  - [Security Hardening](#security-hardening)
- [API Documentation](#api-documentation)
- [SDK Usage](#sdk-usage)
- [MCP Integration](#mcp-integration)
- [Troubleshooting](#troubleshooting)
- [Release Packages](#release-packages)
- [Architecture & Security](#architecture--security)
- [Contributing](#contributing)
- [License & Credits](#license--credits)

---

## Project Overview

**Agent Sandbox** is a hardware-isolated execution environment for AI agents built on Firecracker microVMs. It provides each agent session with a dedicated Linux kernel, ephemeral filesystem, and isolated network stack—all booting in under 100 milliseconds.

### Key Capabilities

- **Hardware-Level Isolation:** Every session runs inside a Firecracker microVM with its own Linux kernel, protected by KVM hypervisor boundaries.
- **Millisecond Boot Times:** Cold start from scratch in ~90ms (p50). Snapshot restoration in 1-5ms.
- **Multi-Language Environments:** Pre-built templates for Node.js 22, Python 3.12, Go 1.23, and support for custom Dockerfiles.
- **Network Isolation:** Per-VM Linux network namespace with dedicated veth pair, TAP device, iptables egress rules, and optional DNS/IP filtering.
- **Three Integration Interfaces:** TypeScript SDK, REST API, and MCP Server (stdio + SSE transports).
- **Automatic Cleanup:** Ephemeral sessions with 30-minute idle TTL, automatic resource reclamation, and startup orphan recovery.

### Use Cases

- AI agent code execution and package installation
- Untrusted code sandboxing (playgrounds, CI/CD, competitive programming)
- Package validation and malware analysis
- Educational environments and code interview platforms

---

## Release Information

**Version:** 1.0.0  
**Release Type:** Initial Public Release  
**Release Date:** January 2025

### Changelog (v1.0.0)

**Features:**
- Firecracker microVM execution with Jailer isolation
- Pre-built environment templates: Node.js, Python, Go
- Custom Dockerfile-based template build pipeline
- TypeScript SDK with zero runtime dependencies
- REST API with Bearer token authentication
- MCP server with stdio and SSE transports
- Per-VM network namespace provisioning
- DNS-based domain filtering and IP/port egress rules
- Bandwidth throttling with tc HTB
- Prometheus metrics and structured Pino logging
- API key management with scope-based access control
- Per-key fixed-window rate limiting
- Session TTL reaping and startup orphan recovery
- Comprehensive test suite (200+ tests, 22 suites)
- Benchmarking harness with microsecond-accurate timing

**Security:**
- KVM hardware-assisted virtualization
- Firecracker Jailer with chroot, seccomp, and UID/GID separation
- Cgroup v2 resource limits (CPU, memory, PIDs, file descriptors)
- Cloud metadata endpoint (169.254.169.254) blocking
- Reverse path filtering (RFC 3704)
- Path traversal protection on all file operations
- Header-only API key authentication (query parameter keys rejected)
- IPv6 DROP default policy inside VM namespaces

**Performance (Reference: Ubuntu 24.04, Intel Core i5-11400H):**
- Cold start: 90.6ms (p50), 104.8ms (p95)
- Snapshot restore: 2.59ms (p50), 3.77ms (p95)
- Warm message RTT: 1.48ms (p50), 9.42ms (p95)
- Network setup: 55.3ms (p50), 75.9ms (p95)

---

## System Requirements

### Minimum Requirements

| Requirement | Details |
|---|---|
| **Operating System** | Linux with kernel 4.14+ (KVM support required) |
| **Hypervisor** | KVM module loaded (`/dev/kvm` accessible) |
| **CPU** | x86_64 or aarch64 with hardware virtualization (Intel VT-x or AMD-V) |
| **RAM** | 2 GB minimum (128 MB per concurrent VM + host overhead) |
| **Disk** | 10 GB free space for templates, snapshots, and jail directories |
| **Firecracker** | v1.0.0+ (Jailer binary required) |
| **Node.js** | v20.12.0 or later |
| **Docker** | v20.10+ (required for template builds only) |
| **Permissions** | Root access or `CAP_NET_ADMIN`, `CAP_SYS_ADMIN` capabilities |

### Recommended Production Configuration

- **CPU:** 4+ cores
- **RAM:** 8 GB (supports ~50 concurrent VMs with 128 MB each)
- **Disk:** SSD with 50 GB free space
- **Network:** 1 Gbps NIC
- **Kernel:** Linux 5.10+ with cgroup v2 enabled

### Checking KVM Support

```bash
# Check if KVM is available
ls -l /dev/kvm

# Expected output:
# crw-rw----+ 1 root kvm 10, 232 Jan 1 12:00 /dev/kvm

# Verify CPU virtualization support
egrep -c '(vmx|svm)' /proc/cpuinfo
# Should return a number > 0

# Check if KVM modules are loaded
lsmod | grep kvm
# Expected: kvm_intel or kvm_amd
```

---

## Installation Instructions

### Linux (Ubuntu/Debian)

#### 1. Install System Dependencies

```bash
# Update package lists
sudo apt-get update

# Install required packages
sudo apt-get install -y \
  curl \
  wget \
  git \
  build-essential \
  iptables \
  iproute2 \
  dnsmasq-base \
  socat

# Install Node.js v20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify Node.js version
node --version  # Should be v20.12.0 or later
```

#### 2. Install Docker (for template builds)

```bash
# Install Docker
curl -fsSL https://get.docker.com | sudo sh

# Add your user to the docker group (optional, for non-root builds)
sudo usermod -aG docker $USER
newgrp docker

# Verify Docker installation
docker --version
```

#### 3. Install Firecracker and Jailer

```bash
ARCH="$(uname -m)"
RELEASE_URL="https://github.com/firecracker-microvm/firecracker/releases"
LATEST=$(basename $(curl -fsSLI -o /dev/null -w %{url_effective} ${RELEASE_URL}/latest))

# Download Firecracker release
curl -L ${RELEASE_URL}/download/${LATEST}/firecracker-${LATEST}-${ARCH}.tgz | tar -xz

# Move binaries to system path
sudo mv release-${LATEST}-${ARCH}/firecracker-${LATEST}-${ARCH} /usr/local/bin/firecracker
sudo mv release-${LATEST}-${ARCH}/jailer-${LATEST}-${ARCH} /usr/local/bin/jailer

# Set executable permissions
sudo chmod +x /usr/local/bin/firecracker /usr/local/bin/jailer

# Verify installation
firecracker --version
jailer --version
```

#### 4. Create Firecracker System User

```bash
# Create firecracker group and user
sudo groupadd -g 982 firecracker 2>/dev/null || true
sudo useradd -u 997 -g 982 -M -s /usr/sbin/nologin firecracker 2>/dev/null || true

# Verify user creation
id firecracker
# Expected: uid=997(firecracker) gid=982(firecracker) groups=982(firecracker)
```

#### 5. Enable IP Forwarding

```bash
# Enable IP forwarding temporarily
sudo sysctl -w net.ipv4.ip_forward=1

# Make it persistent across reboots
echo "net.ipv4.ip_forward = 1" | sudo tee /etc/sysctl.d/99-ip-forward.conf

# Apply sysctl settings
sudo sysctl -p /etc/sysctl.d/99-ip-forward.conf
```

#### 6. Clone and Install Agent Sandbox

```bash
# Clone the repository
git clone https://github.com/SheerWill007/Agent-Sandbox.git
cd Agent-Sandbox/backend

# Install Node.js dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Verify build
ls -l dist/
```

#### 7. Download Kernel and Build Templates

```bash
# Create artifacts directory
sudo mkdir -p /var/lib/agent-sandbox/artifacts
sudo chown root:firecracker /var/lib/agent-sandbox/artifacts
sudo chmod 750 /var/lib/agent-sandbox/artifacts

# Download pre-built kernel
wget https://github.com/SheerWill007/Agent-Sandbox/releases/download/Beta/vmlinux
sudo mv vmlinux /var/lib/agent-sandbox/artifacts/

# Build environment templates (requires Docker)
cd ..  # Back to Agent-Sandbox root
sudo ./templates/build.sh node
sudo ./templates/build.sh python
sudo ./templates/build.sh go

# Verify templates
sudo ls -l /var/lib/agent-sandbox/artifacts/templates/
```

#### 8. Create API Key

```bash
cd backend
npm run keys create "production-key"

# Save the printed API key (it will not be shown again)
# Example output: Created API key: sk_test_abc123...
```

#### 9. Start the Server

```bash
# Start with sudo (required for Jailer and network namespaces)
sudo npm start

# Server will listen on http://localhost:3000
```

---

### Linux (RHEL/CentOS/Fedora)

```bash
# Install system dependencies
sudo dnf install -y curl wget git gcc gcc-c++ make iptables iproute dnsmasq socat

# Install Node.js v20.x
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

# Install Docker
sudo dnf install -y dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io
sudo systemctl start docker
sudo systemctl enable docker

# Follow Ubuntu steps 3-9 above for Firecracker, Agent Sandbox, and configuration
```

---

### Linux (Arch)

```bash
# Install system dependencies
sudo pacman -S curl wget git base-devel iptables iproute2 dnsmasq socat nodejs npm docker

# Start and enable Docker
sudo systemctl start docker
sudo systemctl enable docker

# Follow Ubuntu steps 3-9 above for Firecracker, Agent Sandbox, and configuration
```

---

### Windows (WSL2)

Agent Sandbox requires Linux with KVM. On Windows, use WSL2 with nested virtualization.

#### 1. Install WSL2

```powershell
# Open PowerShell as Administrator

# Install WSL2
wsl --install

# Restart your computer if prompted
```

#### 2. Enable Nested Virtualization

For Hyper-V (Windows 10 Pro/Enterprise/Education):

```powershell
# Run in PowerShell as Administrator

# Get your WSL2 VM name
wsl --list --verbose

# Enable nested virtualization (replace "Ubuntu" with your WSL distro name)
Set-VMProcessor -VMName "Ubuntu" -ExposeVirtualizationExtensions $true
```

For VMware Workstation:
- Open VM settings → Processors → Enable "Virtualize Intel VT-x/EPT or AMD-V/RVI"

#### 3. Install Ubuntu in WSL2

```powershell
# Install Ubuntu
wsl --install -d Ubuntu

# Launch Ubuntu
wsl
```

#### 4. Inside WSL2, Follow Linux (Ubuntu/Debian) Steps

Once inside the WSL2 Ubuntu environment, follow all steps from the [Linux (Ubuntu/Debian)](#linux-ubuntudebian) section above.

#### 5. Verify KVM Access

```bash
# Inside WSL2 Ubuntu
ls -l /dev/kvm

# If /dev/kvm doesn't exist, you may need to load the KVM module:
sudo modprobe kvm
sudo modprobe kvm-intel  # or kvm-amd for AMD CPUs
```

---

### macOS

Firecracker requires Linux with KVM, which is not natively available on macOS. Use Lima (lightweight Linux VM) or UTM.

#### Option 1: Using Lima

```bash
# Install Lima
brew install lima

# Start a Linux VM with KVM support
limactl start --name=agent-sandbox template://experimental/vz

# Shell into the VM
lima agent-sandbox

# Inside the Lima VM, follow Linux (Ubuntu/Debian) installation steps
```

#### Option 2: Using UTM

1. Install [UTM](https://mac.getutm.app/)
2. Create a new Linux VM (Ubuntu Server 22.04 or later)
3. Enable hardware virtualization in UTM VM settings
4. Inside the VM, follow Linux (Ubuntu/Debian) installation steps

**Note:** macOS performance may be significantly lower than native Linux due to nested virtualization overhead.

---

## Quick Start Guide

This guide assumes you have completed the installation steps above.

### 1. Verify Installation

```bash
# Check that the server is running
curl http://localhost:3000/health

# Expected output:
# {"status":"ok","uptime":123.456}
```

### 2. List Available Templates

```bash
export SANDBOX_API_KEY="sk_test_your_key_here"

curl -H "Authorization: Bearer $SANDBOX_API_KEY" \
  http://localhost:3000/exec/templates

# Expected output:
# [
#   {"name":"node","displayName":"Node.js 22","..."},
#   {"name":"python","displayName":"Python 3.12","..."},
#   {"name":"go","displayName":"Go 1.23","..."}
# ]
```

### 3. Execute Your First Command

```bash
curl -X POST http://localhost:3000/exec/my-first-session/execute \
  -H "Authorization: Bearer $SANDBOX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "template": "python",
    "command": "python3",
    "args": ["-c", "print(\"Hello from Agent Sandbox!\")"]
  }'

# Expected output:
# {
#   "type": "output",
#   "output": [
#     {"type":"stream","stream":"stdout","data":"Hello from Agent Sandbox!\n"}
#   ],
#   "exitCode": 0
# }
```

### 4. Write and Execute a File

```bash
# Write a Python script
curl -X POST http://localhost:3000/exec/my-session/write \
  -H "Authorization: Bearer $SANDBOX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "hello.py",
    "content": "import sys\nprint(f\"Python {sys.version}\")"
  }'

# Execute the script
curl -X POST http://localhost:3000/exec/my-session/execute \
  -H "Authorization: Bearer $SANDBOX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "template": "python",
    "command": "python3",
    "args": ["hello.py"]
  }'
```

### 5. Install a Package

```bash
curl -X POST http://localhost:3000/exec/my-session/execute \
  -H "Authorization: Bearer $SANDBOX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "template": "node",
    "command": "npm",
    "args": ["install", "lodash"]
  }'
```

### 6. Clean Up

```bash
# Destroy the session
curl -X DELETE -H "Authorization: Bearer $SANDBOX_API_KEY" \
  http://localhost:3000/exec/my-session
```

---

## Building from Source

### Prerequisites

- Linux with KVM support
- Node.js v20.12+
- Docker v20.10+
- Git

### Build Steps

```bash
# 1. Clone the repository
git clone https://github.com/SheerWill007/Agent-Sandbox.git
cd Agent-Sandbox

# 2. Install backend dependencies
cd backend
npm install

# 3. Build TypeScript
npm run build

# Output will be in backend/dist/

# 4. Run tests
npm test

# 5. Run end-to-end tests (requires root, KVM, and Firecracker)
sudo npm run test:e2e

# 6. Build environment templates
cd ..
sudo ./templates/build.sh node
sudo ./templates/build.sh python
sudo ./templates/build.sh go

# 7. Build custom template (optional)
# Create templates/myenv/Dockerfile, then:
sudo ./templates/build.sh myenv

# 8. Build SDK (optional)
cd backend/sdk/typescript
npm install
npm run build
npm pack  # Creates agent-sandbox-sdk-1.0.0.tgz
```

### Running in Development Mode

```bash
cd backend

# Start with auto-reload (uses tsx for TypeScript execution)
npm run dev

# Run specific test suite
npm test -- session

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

---

## Deployment Guide

### Systemd Service

Create a systemd service unit for production deployment.

#### Service File: `/etc/systemd/system/agent-sandbox.service`

```ini
[Unit]
Description=Agent Sandbox - Hardware-Isolated Execution for AI Agents
Documentation=https://github.com/SheerWill007/Agent-Sandbox
After=network.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/agent-sandbox/backend
Environment="NODE_ENV=production"
Environment="PORT=3000"
Environment="LOG_LEVEL=info"
Environment="AUTH_ENABLED=true"
Environment="AUTH_KEYS_PATH=/var/lib/agent-sandbox/keys.json"
Environment="FIRECRACKER_BIN=/usr/local/bin/firecracker"
Environment="FIRECRACKER_JAILER_BIN=/usr/local/bin/jailer"
Environment="FIRECRACKER_JAIL_BASE=/var/lib/agent-sandbox/jailer"
Environment="FIRECRACKER_ARTIFACTS_DIR=/var/lib/agent-sandbox/artifacts"
Environment="SESSION_TTL_MS=1800000"
Environment="STRICT_PERMISSIONS=true"

ExecStart=/usr/bin/node /opt/agent-sandbox/backend/dist/server.js

# Restart policy
Restart=on-failure
RestartSec=10s
StartLimitInterval=200s
StartLimitBurst=5

# Resource limits
LimitNOFILE=65536
LimitNPROC=32768

# Security hardening
NoNewPrivileges=false
ProtectHome=yes
ProtectSystem=strict
ReadWritePaths=/var/lib/agent-sandbox
PrivateTmp=yes

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=agent-sandbox

[Install]
WantedBy=multi-user.target
```

#### Deploy and Enable Service

```bash
# Copy application to /opt
sudo mkdir -p /opt/agent-sandbox
sudo cp -r Agent-Sandbox/* /opt/agent-sandbox/
sudo chown -R root:root /opt/agent-sandbox

# Install service unit
sudo cp agent-sandbox.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable agent-sandbox

# Start service
sudo systemctl start agent-sandbox

# Check status
sudo systemctl status agent-sandbox

# View logs
sudo journalctl -u agent-sandbox -f
```

---

### Nginx Reverse Proxy

Deploy Agent Sandbox behind Nginx for SSL termination, load balancing, and rate limiting.

#### Configuration: `/etc/nginx/sites-available/agent-sandbox`

```nginx
upstream agent_sandbox {
    server 127.0.0.1:3000;
    keepalive 64;
}

# Rate limiting zones
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/m;
limit_req_zone $binary_remote_addr zone=exec_limit:10m rate=50r/m;

server {
    listen 80;
    listen [::]:80;
    server_name sandbox.example.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name sandbox.example.com;

    # SSL/TLS Configuration
    ssl_certificate /etc/letsencrypt/live/sandbox.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sandbox.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Logging
    access_log /var/log/nginx/agent-sandbox-access.log combined;
    error_log /var/log/nginx/agent-sandbox-error.log warn;

    # Health check (no auth required)
    location = /health {
        proxy_pass http://agent_sandbox;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        access_log off;
    }

    # Metrics endpoint
    location /metrics {
        limit_req zone=api_limit burst=10 nodelay;
        proxy_pass http://agent_sandbox;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
    }

    # Execution API endpoints
    location /exec/ {
        limit_req zone=exec_limit burst=20 nodelay;
        
        proxy_pass http://agent_sandbox;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Timeouts for long-running commands
        proxy_connect_timeout 60s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
        
        # Disable buffering for streaming responses
        proxy_buffering off;
        proxy_cache off;
    }

    # MCP SSE endpoint
    location /mcp {
        limit_req zone=api_limit burst=5 nodelay;
        
        proxy_pass http://agent_sandbox;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
        
        # SSE-specific settings
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Cache-Control "no-cache";
        proxy_read_timeout 86400s;  # 24 hours for persistent SSE connections
    }

    # Admin API endpoints
    location /admin/ {
        limit_req zone=api_limit burst=5 nodelay;
        
        proxy_pass http://agent_sandbox;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
    }
}
```

#### Enable Nginx Configuration

```bash
# Install Nginx
sudo apt-get install -y nginx

# Copy configuration
sudo ln -s /etc/nginx/sites-available/agent-sandbox /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

### SSL/TLS Configuration

Use Let's Encrypt Certbot for free SSL certificates.

```bash
# Install Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Obtain certificate (replace sandbox.example.com with your domain)
sudo certbot --nginx -d sandbox.example.com

# Certbot will automatically update your Nginx configuration

# Test automatic renewal
sudo certbot renew --dry-run

# Certificates will auto-renew via cron/systemd timer
```

---

### Environment Configuration

All configuration is supplied via environment variables. Create `/opt/agent-sandbox/backend/.env` for production settings.

#### Production `.env` Example

```bash
# Server
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Authentication
AUTH_ENABLED=true
AUTH_KEYS_PATH=/var/lib/agent-sandbox/keys.json
AUTH_KEY_PREFIX=sk_prod_
MCP_AUTH_TOKEN=your-secure-mcp-token-here

# Firecracker Paths
FIRECRACKER_BIN=/usr/local/bin/firecracker
FIRECRACKER_JAILER_BIN=/usr/local/bin/jailer
FIRECRACKER_JAIL_BASE=/var/lib/agent-sandbox/jailer
FIRECRACKER_ARTIFACTS_DIR=/var/lib/agent-sandbox/artifacts
FIRECRACKER_UID=997
FIRECRACKER_GID=982

# VM Resources
VM_VCPU_COUNT=1
VM_MEM_SIZE_MIB=128
VM_CPU_QUOTA_US=50000
VM_CPU_PERIOD_US=100000
VM_MEMORY_LIMIT_BYTES=134217728
VM_NOFILE_LIMIT=1024
VM_PIDS_LIMIT=256
VM_MAX_SLOTS=254

# Security
STRICT_PERMISSIONS=true

# Network Filtering
VM_DNS_MODE=none
VM_DNS_DOMAINS=
VM_DNS_UPSTREAM=8.8.8.8,1.1.1.1
VM_DEST_MODE=none
VM_DEST_RULES=

# Bandwidth Throttling
VM_BW_ENABLED=false
VM_BW_RATE_KBIT=10240
VM_BW_BURST_KBIT=1024

# Session Management
SESSION_TTL_MS=1800000
SESSION_MANIFEST_PATH=/var/lib/agent-sandbox/sessions.json
```

#### Load Environment Variables in Systemd

Update your systemd service file to load the `.env` file:

```ini
[Service]
EnvironmentFile=/opt/agent-sandbox/backend/.env
```

---

### Security Hardening

#### 1. Firewall Rules (iptables)

```bash
# Allow SSH (port 22)
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT

# Allow HTTP/HTTPS (ports 80, 443)
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# Block direct access to Agent Sandbox port (3000) from external sources
sudo iptables -A INPUT -p tcp --dport 3000 ! -s 127.0.0.1 -j DROP

# Allow established connections
sudo iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Save rules
sudo netfilter-persistent save
```

#### 2. API Key Rotation

```bash
# Rotate a key (disables old, creates new with same settings)
npm run keys rotate <key-id>

# Schedule regular rotation (e.g., every 90 days)
# Add to crontab: 0 0 1 */3 * /opt/agent-sandbox/backend/scripts/rotate-keys.sh
```

#### 3. Resource Monitoring

```bash
# Monitor active VMs
curl -H "Authorization: Bearer $ADMIN_KEY" http://localhost:3000/exec/

# Monitor Prometheus metrics
curl -H "Authorization: Bearer $METRICS_KEY" http://localhost:3000/metrics

# Set up Prometheus scraping (prometheus.yml):
# scrape_configs:
#   - job_name: 'agent-sandbox'
#     static_configs:
#       - targets: ['localhost:3000']
#     metrics_path: '/metrics'
#     authorization:
#       credentials: 'your-metrics-api-key'
```

#### 4. Log Monitoring

```bash
# Monitor for errors
sudo journalctl -u agent-sandbox -p err -f

# Monitor for authentication failures
sudo journalctl -u agent-sandbox | grep "Auth failed"

# Ship logs to external service (e.g., Elasticsearch, Splunk, Datadog)
# Configure in your logging aggregator to scrape journalctl or stdout
```

#### 5. Restrict Network Access

Configure DNS and destination filtering to limit VM internet access:

```bash
# Allow only specific domains (whitelist mode)
VM_DNS_MODE=allow
VM_DNS_DOMAINS=*.npmjs.org,*.pypi.org,github.com,registry.npmjs.org

# Block specific domains (blacklist mode)
VM_DNS_MODE=deny
VM_DNS_DOMAINS=malicious-site.com,tracker.example.net

# Allow only specific IP ranges and ports
VM_DEST_MODE=allow
VM_DEST_RULES=1.1.1.1/32:53/udp,8.8.8.8/32:53/udp,0.0.0.0/0:443/tcp,0.0.0.0/0:80/tcp
```

---

## API Documentation

Agent Sandbox exposes a REST API with Bearer token authentication.

### Base URL

```
http://localhost:3000
```

### Authentication

All endpoints (except `/health` and `/ready`) require an `Authorization` header:

```
Authorization: Bearer sk_test_your_api_key_here
```

### Endpoints

#### Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "uptime": 123.456
}
```

#### Readiness Check

```http
GET /ready
```

Returns 200 if ready, 503 if not (e.g., high memory usage).

#### List Templates

```http
GET /exec/templates
Authorization: Bearer <key>
```

**Response:**
```json
[
  {
    "name": "node",
    "displayName": "Node.js 22",
    "description": "Node.js 22 with npm, pnpm, git, curl",
    "tools": ["node", "npm", "pnpm", "git", "curl"]
  },
  {
    "name": "python",
    "displayName": "Python 3.12",
    "description": "Python 3.12 with pip, git, curl",
    "tools": ["python3", "pip", "git", "curl"]
  }
]
```

#### Execute Command

```http
POST /exec/:sessionId/execute
Authorization: Bearer <key>
Content-Type: application/json

{
  "template": "python",
  "command": "python3",
  "args": ["-c", "print('Hello')"],
  "env": {"MY_VAR": "value"},
  "timeout": 60000
}
```

**Response:**
```json
{
  "type": "output",
  "output": [
    {"type": "stream", "stream": "stdout", "data": "Hello\n"}
  ],
  "exitCode": 0
}
```

**Streaming Response (with `Accept: application/x-ndjson`):**
```
{"type":"stream","stream":"stdout","data":"Hello\n"}
{"type":"exit","exitCode":0}
```

#### Write File

```http
POST /exec/:sessionId/write
Authorization: Bearer <key>
Content-Type: application/json

{
  "path": "hello.py",
  "content": "print('Hello World')"
}
```

**Response:**
```json
{
  "type": "success"
}
```

#### Read File

```http
GET /exec/:sessionId/read?path=hello.py
Authorization: Bearer <key>
```

**Response:**
```json
{
  "type": "file",
  "content": "print('Hello World')"
}
```

#### List Files

```http
GET /exec/:sessionId/files?path=/workspace&recursive=true
Authorization: Bearer <key>
```

**Response:**
```json
{
  "type": "files",
  "files": [
    {"name": "hello.py", "type": "file", "size": 20},
    {"name": "data", "type": "directory"}
  ]
}
```

#### Destroy Session

```http
DELETE /exec/:sessionId
Authorization: Bearer <key>
```

**Response:**
```json
{
  "message": "Session destroyed"
}
```

#### List Active Sessions

```http
GET /exec/
Authorization: Bearer <key>
```

**Response:**
```json
{
  "sessions": [
    {
      "sessionId": "my-session",
      "template": "node",
      "createdAt": "2024-01-01T12:00:00.000Z",
      "lastActivityAt": "2024-01-01T12:05:00.000Z"
    }
  ]
}
```

---

## SDK Usage

The TypeScript SDK provides a type-safe client for Agent Sandbox.

### Installation

```bash
# From npm (once published)
npm install @agent-sandbox/sdk

# From local build
npm install /path/to/Agent-Sandbox/backend/sdk/typescript
```

### Quick Example

```typescript
import { Sandbox } from "@agent-sandbox/sdk";

const sandbox = new Sandbox({
  baseUrl: "http://localhost:3000",
  apiKey: process.env.SANDBOX_API_KEY,
});

// Create a session
const session = sandbox.create({ template: "python" });

// Execute code
const result = await session.runCode("print(2 + 2)");
console.log(result.output[0].data);  // "4\n"

// Write and read files
await session.writeFile("data.json", JSON.stringify({ key: "value" }));
const file = await session.readFile("data.json");
console.log(file.content);

// Stream command output
for await (const chunk of session.execStream("npm", { args: ["test"] })) {
  if (chunk.type === "stream") {
    process.stdout.write(chunk.data);
  }
}

// Clean up
await session.destroy();
```

### API Reference

See `backend/sdk/typescript/README.md` for the full SDK documentation.

---

## MCP Integration

Agent Sandbox provides a Model Context Protocol server for integration with MCP-compatible agents.

### Available Tools

| Tool | Description |
|---|---|
| `create_session` | Create a new isolated execution session |
| `list_templates` | List available environment templates |
| `execute` | Execute a command in a session |
| `write_file` | Write content to the session workspace |
| `read_file` | Read a file from the session workspace |
| `list_files` | List workspace directory contents |
| `reset_session` | Destroy a session and release all resources |
| `ping` | Liveness check |

### Stdio Transport

For local MCP clients (Claude Desktop, Cline, Roo Cline):

#### Configuration (`~/.config/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "agent-sandbox": {
      "command": "node",
      "args": ["/path/to/Agent-Sandbox/backend/dist/mcp/stdio.js"]
    }
  }
}
```

### SSE Transport

For remote MCP clients over HTTP:

```http
POST http://localhost:3000/mcp
Authorization: Bearer <MCP_AUTH_TOKEN>
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "execute",
    "arguments": {
      "sessionId": "test",
      "template": "python",
      "command": "python3",
      "args": ["--version"]
    }
  },
  "id": 1
}
```

Set `MCP_AUTH_TOKEN` in your environment variables.

---

## Troubleshooting

### Issue: `/dev/kvm not found`

**Symptoms:**
```
Error: Cannot access /dev/kvm: No such file or directory
```

**Solutions:**
1. Check if KVM module is loaded:
   ```bash
   lsmod | grep kvm
   ```
   If empty, load the module:
   ```bash
   sudo modprobe kvm
   sudo modprobe kvm-intel  # or kvm-amd for AMD CPUs
   ```

2. Verify CPU virtualization support:
   ```bash
   egrep -c '(vmx|svm)' /proc/cpuinfo
   ```
   Should return > 0. If 0, enable virtualization in BIOS.

3. Check permissions:
   ```bash
   ls -l /dev/kvm
   sudo chmod 666 /dev/kvm  # Temporary fix
   ```

---

### Issue: Permission denied when starting Firecracker

**Symptoms:**
```
Error: Permission denied (os error 13)
Failed to create jail directory
```

**Solutions:**
1. Ensure you're running with `sudo`:
   ```bash
   sudo npm start
   ```

2. Verify Firecracker user exists:
   ```bash
   id firecracker
   ```

3. Check jail directory permissions:
   ```bash
   sudo ls -ld /var/lib/agent-sandbox/jailer
   sudo chown root:firecracker /var/lib/agent-sandbox/jailer
   sudo chmod 750 /var/lib/agent-sandbox/jailer
   ```

4. Set `STRICT_PERMISSIONS=false` for development (not recommended for production):
   ```bash
   export STRICT_PERMISSIONS=false
   sudo npm start
   ```

---

### Issue: Snapshot or template not found

**Symptoms:**
```
Error: Template "python" not found
```

**Solutions:**
1. List available templates:
   ```bash
   sudo ls -l /var/lib/agent-sandbox/artifacts/templates/
   ```

2. Rebuild the template:
   ```bash
   sudo ./templates/build.sh python
   ```

3. Verify kernel is present:
   ```bash
   sudo ls -l /var/lib/agent-sandbox/artifacts/vmlinux
   ```

---

### Issue: Port 3000 already in use

**Symptoms:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solutions:**
1. Find the process using port 3000:
   ```bash
   sudo lsof -i :3000
   ```

2. Kill the process or change the port:
   ```bash
   export PORT=3001
   sudo npm start
   ```

---

### Issue: VM fails to boot or times out

**Symptoms:**
```
Error: VM boot timeout after 30000ms
```

**Solutions:**
1. Check Firecracker version:
   ```bash
   firecracker --version
   ```
   Must be v1.0.0 or later.

2. Verify network namespace creation:
   ```bash
   sudo ip netns list
   ```

3. Check kernel log for errors:
   ```bash
   sudo dmesg | tail -50
   ```

4. Increase VM memory if needed:
   ```bash
   export VM_MEM_SIZE_MIB=256
   sudo npm start
   ```

---

### Issue: Template build fails

**Symptoms:**
```
Error: Docker build failed
Error: Failed to extract rootfs
```

**Solutions:**
1. Ensure Docker is running:
   ```bash
   sudo systemctl status docker
   sudo systemctl start docker
   ```

2. Check Docker permissions:
   ```bash
   sudo usermod -aG docker $USER
   newgrp docker
   ```

3. Verify disk space:
   ```bash
   df -h /var/lib/docker
   ```

4. Clean Docker cache and retry:
   ```bash
   sudo docker system prune -a
   sudo ./templates/build.sh python
   ```

---

### Issue: Authentication failures

**Symptoms:**
```
401 Unauthorized
Error: Invalid API key
```

**Solutions:**
1. Verify API key is correct and not expired:
   ```bash
   npm run keys list
   ```

2. Check key format (must start with configured prefix, default `sk_test_`):
   ```bash
   echo $SANDBOX_API_KEY
   ```

3. Ensure `Authorization` header is set correctly:
   ```bash
   curl -H "Authorization: Bearer sk_test_..." http://localhost:3000/exec/templates
   ```

4. Check if authentication is enabled:
   ```bash
   # Disable auth for testing (NOT for production)
   export AUTH_ENABLED=false
   sudo npm start
   ```

---

## Release Packages

### Linux Package (`agent-sandbox-linux-v1.0.0.tar.gz`)

**Contents:**
```
agent-sandbox/
├── backend/
│   ├── dist/              # Compiled JavaScript
│   ├── node_modules/      # Dependencies
│   ├── package.json
│   ├── package-lock.json
│   └── README.md
├── frontend/
│   ├── index.html
│   ├── assets/
│   │   ├── css/style.css
│   │   └── js/main.js
├── docs/
│   └── RELEASE.md
├── templates/
│   ├── build.sh
│   ├── base/
│   ├── node/
│   ├── python/
│   └── go/
├── LICENSE
├── README.md
└── install.sh             # Installation script
```

**Installation:**
```bash
tar -xzf agent-sandbox-linux-v1.0.0.tar.gz
cd agent-sandbox
sudo ./install.sh
```

---

### Windows Package (`agent-sandbox-windows-v1.0.0.zip`)

**Contents:** Same as Linux package, plus:
```
agent-sandbox/
├── wsl-setup.ps1          # PowerShell script to configure WSL2
└── README-WINDOWS.txt     # Windows-specific instructions
```

**Installation:**
1. Run `wsl-setup.ps1` in PowerShell (Admin)
2. Inside WSL2, extract and run `install.sh`

---

### macOS Package (`agent-sandbox-macos-v1.0.0.tar.gz`)

**Contents:** Same as Linux package, plus:
```
agent-sandbox/
├── lima-setup.sh          # Script to configure Lima VM
└── README-MACOS.txt       # macOS-specific instructions
```

**Installation:**
```bash
tar -xzf agent-sandbox-macos-v1.0.0.tar.gz
cd agent-sandbox
./lima-setup.sh
```

---

## Architecture & Security

### VM Isolation Layers

| Layer | Mechanism | Protection |
|---|---|---|
| **Hardware** | KVM hypervisor | Kernel-mode VM exit enforcement, IOMMU, EPT/NPT |
| **Process** | Firecracker Jailer | Chroot, seccomp, dedicated UID/GID (997/982) |
| **Compute** | Cgroup v2 limits | CPU quota (50%), memory max (128 MB), PID limit (256) |
| **Filesystem** | Read-only rootfs + tmpfs workspace | Immutable OS, ephemeral data (512 MB tmpfs) |
| **Network** | Per-VM Linux namespace | Dedicated veth pair, TAP device, NAT, iptables egress |
| **IPC** | vsock with socat bridge | No shared memory, no UNIX sockets to host |

### Network Packet Path

```
MicroVM guest (eth0: 192.168.241.2/29)
    |
tap0 (192.168.241.1/29) inside VM network namespace
    | Per-namespace iptables:
    |   - PREROUTING: DNS redirect (53/udp,tcp -> dnsmasq)
    |   - FORWARD VM_EGRESS: drop 169.254.169.254, optional rules
    |   - POSTROUTING: MASQUERADE -> vethNs
    |
vethNs (10.0.{slot}.1/30) inside VM namespace
    |  veth pair across namespace boundary
vethHost (10.0.{slot}.2/30) on host
    | Host-level iptables:
    |   - INPUT: DROP 10.0.0.0/16 -> host services
    |   - FORWARD: DROP 169.254.169.254 (defense-in-depth)
    |   - FORWARD: DROP 10.0.0.0/16 -> 10.0.0.0/16 (cross-tenant)
    |   - FORWARD: ACCEPT 10.0.0.0/16 outbound + conntrack return
    |   - POSTROUTING: MASQUERADE -> WAN interface
    |
Internet
```

### Threat Mitigations

| Threat | Mitigation | Implementation |
|---|---|---|
| Host escape | KVM + Jailer | Hardware virtualization, unprivileged UID, chroot, seccomp |
| IP spoofing | Reverse path filtering | `rp_filter=2` on all VM tap devices |
| Port scanning host | Host firewall | `iptables -I INPUT -s 10.0.0.0/16 -j DROP` |
| Cloud metadata theft | IMDS block | 169.254.169.254/32 dropped at VM egress + host FORWARD |
| DNS bypass | Transparent interception | REDIRECT UDP/TCP 53 -> dnsmasq, DROP direct 53 egress |
| Fork bombs | PID limit | `pids.max=256` in VM cgroup |
| OOM attacks | Memory limit | `memory.max=128MB` in VM cgroup |
| Cross-tenant hijack | Ownership enforcement | API key scoped to session owner, verified on all operations |
| Path traversal | Normalized path validation | `isInsideWorkspace` checks all file operations |
| Credential leakage | Header-only auth | Query parameter keys rejected |

---

## Contributing

Contributions are welcome! Please follow these guidelines:

### Development Setup

```bash
# Clone and install
git clone https://github.com/SheerWill007/Agent-Sandbox.git
cd Agent-Sandbox/backend
npm install

# Run tests
npm test

# Run in dev mode with auto-reload
npm run dev
```

### Coding Standards

- **TypeScript:** Strict mode enabled, no `any` types without explicit comment justification
- **Linting:** ESLint + Prettier (run `npm run lint` and `npm run format`)
- **Testing:** Write tests for all new features and bug fixes (Vitest)
- **Commit Messages:** Follow [Conventional Commits](https://www.conventionalcommits.org/)
  - `feat: add MCP SSE transport`
  - `fix: correct path traversal check in filesystem operations`
  - `docs: update installation instructions for Ubuntu 24.04`
  - `refactor: extract network setup into separate module`

### Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Run tests: `npm test`
5. Run linter: `npm run lint`
6. Commit with conventional message: `git commit -m "feat: add feature"`
7. Push to your fork: `git push origin feat/my-feature`
8. Open a Pull Request against `main`
9. Wait for CI checks to pass and review

### Reporting Issues

- Use GitHub Issues: https://github.com/SheerWill007/Agent-Sandbox/issues
- Include:
  - OS and kernel version
  - Node.js version
  - Firecracker version
  - Steps to reproduce
  - Expected vs actual behavior
  - Relevant logs

---

## License & Credits

### License

Agent Sandbox is licensed under the **GNU Affero General Public License version 3 (AGPL-3.0-only)**.

You are free to use, study, modify, and distribute this software under the terms of the AGPL-3.0. If you run a modified version of this software as a network service, you must make the complete corresponding source code available to users of that service under the same license.

See the `LICENSE` file in the repository root for the full license text.

### Author

**William Law (Vivek Jadhav)**

- Website: https://willx.tech
- GitHub: https://github.com/SheerWill007
- Repository: https://github.com/SheerWill007/Agent-Sandbox

### Credits

Agent Sandbox is built on top of excellent open-source projects:

- **Firecracker** by Amazon Web Services (Apache 2.0) — https://github.com/firecracker-microvm/firecracker
- **Node.js** by OpenJS Foundation (MIT) — https://nodejs.org
- **Express** by TJ Holowaychuk (MIT) — https://expressjs.com
- **Vitest** by Anthony Fu (MIT) — https://vitest.dev
- **Pino** by Matteo Collina (MIT) — https://getpino.io
- **prom-client** by Simon Nyberg (Apache 2.0) — https://github.com/siimon/prom-client

### Acknowledgments

Special thanks to the Firecracker team at AWS for creating a secure, lightweight VMM that makes this project possible.

---

**End of Release Documentation**

For support, issues, or contributions, visit https://github.com/SheerWill007/Agent-Sandbox.
