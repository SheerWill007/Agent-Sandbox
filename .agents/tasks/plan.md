# Implementation Plan: Agent Sandbox Landing Page & Restructure

This plan restructures the Agent-Sandbox repository into a backend/frontend/docs layout, builds a professional Auronix-inspired landing page, and creates comprehensive release documentation.

## Context

**Project**: Agent Sandbox — Firecracker microVM execution environment for AI agents
**Current Structure**: Flat layout with src/, sdk/typescript/, templates/, minimal-rootfs/ at root
**Goal**: Professional presentation with /backend (all source), /frontend (landing page), /docs (RELEASE.md)
**Design Inspiration**: https://auronix.webflow.io — dark theme, blue/purple gradients, modern SaaS aesthetic

## Implementation Steps

### Phase 1: Repository Restructure

- [ ] 1. **Create new directory structure**
      Create /backend, /frontend, /docs directories at repository root.
      Files: backend/, frontend/, docs/
      Verify: `ls` at root shows the three new directories

- [ ] 2. **Move all backend code and configuration to /backend**
      Move src/, sdk/, templates/, minimal-rootfs/, package.json, package-lock.json, tsconfig.json, vitest.config.ts, example.env, CONTRIBUTING.md, .editorconfig, .eslintignore, .eslintrc.json, .prettierignore, .prettierrc.json, .github/ to backend/.
      Copy LICENSE to backend/ (keep original at root).
      Remove quick-start.bat from root.
      Files: All files moved to backend/, root now has only README.md, LICENSE, .gitignore, and three directories
      Verify: `ls` at root shows minimal files; `ls backend/` shows all moved content

- [ ] 3. **Update backend configuration files**
      Update backend/package.json (verify paths if needed), backend/tsconfig.json (check outDir, rootDir), backend/.github/workflows/*.yml (add working-directory: backend or update paths).
      Create backend/.gitignore with dist/, node_modules/.
      Update root .gitignore to exclude backend/dist/, backend/node_modules/.
      Files: backend/package.json, backend/tsconfig.json, backend/.github/workflows/*.yml, backend/.gitignore, .gitignore
      Verify: `cd backend && npm install && npm run build` — TypeScript compiles successfully; `cd backend && npm test` — tests pass

### Phase 2: Frontend Landing Page

- [ ] 4. **Create frontend HTML structure**
      Create frontend/index.html with semantic HTML5 structure: nav, hero section, features section, how-it-works section, architecture section, code examples section, capabilities section, performance metrics section, security section, CTA section, footer.
      Files: frontend/index.html
      Verify: Open frontend/index.html in browser — basic structure displays

- [ ] 5. **Create dark theme CSS with Auronix-inspired styling**
      Create frontend/css/styles.css with CSS variables for dark theme (dark backgrounds, blue/purple gradients, white/gray text), typography, spacing, responsive breakpoints (mobile-first: 640px, 768px, 1024px).
      Style all sections: hero with gradient heading, feature grid (CSS Grid, responsive 1-2-3 columns), code blocks with syntax styling, performance metrics cards, footer.
      Files: frontend/css/styles.css
      Verify: Open frontend/index.html in browser — dark theme applied, page looks professional

- [ ] 6. **Implement page content and interactivity**
      Populate all sections with accurate content from README.md: features (Hardware Isolation, <100ms boot, Linux environment, templates, ephemeral sessions), capabilities (SDK, REST, MCP), performance numbers (90ms cold start p50, 1-5ms snapshot restore, 128MB memory), security layers (kernel isolation, network namespace, jailer, cgroups).
      Create frontend/js/main.js for tab switching in code examples section, optional mobile nav toggle.
      Add favicon (frontend/favicon.png or favicon.ico).
      Files: frontend/index.html (content), frontend/js/main.js, frontend/favicon.png
      Verify: Open frontend/index.html — all content displays correctly; click code example tabs — they switch; resize browser to 375px, 768px, 1280px — layout responds correctly

### Phase 3: Documentation

- [ ] 7. **Create comprehensive docs/RELEASE.md**
      Create docs/RELEASE.md with all sections: Title, Table of Contents, Introduction, Installation (Linux: KVM, Firecracker, user setup, IP forwarding, kernel download, npm install, templates, API keys), Deployment (local, production, systemd service example, nginx reverse proxy snippet, monitoring), Usage (SDK examples, REST API curl examples, MCP setup), Release Packages (structure for Linux .tar.gz, macOS .tar.gz/.pkg, Windows .zip — note: actual binaries not built in this task), Configuration Reference (all env vars from example.env in table), Troubleshooting (common issues), Release Notes (v1.0.0 initial release), License, Authors.
      Files: docs/RELEASE.md
      Verify: Read docs/RELEASE.md start to finish — comprehensive and clear; check docs/ has only RELEASE.md

- [ ] 8. **Update root README.md**
      Update root README.md to describe new repository structure: add 'Repository Structure' section at top explaining /backend (all source code, link to backend/README.md), /frontend (landing page, link to frontend/index.html), /docs (comprehensive docs, link to docs/RELEASE.md).
      Keep brief project overview.
      Files: README.md
      Verify: Read README.md — structure section clear, links correct

### Final Verification

- [ ] 9. **Full integration check**
      Verify repository structure: root has only README.md, LICENSE, .gitignore, backend/, frontend/, docs/.
      Verify backend builds and tests: `cd backend && npm run build && npm test`.
      Verify frontend loads: open frontend/index.html in browser, test responsive design (375px, 768px, 1280px).
      Verify documentation: read docs/RELEASE.md for completeness, check root README.md describes structure correctly.
      Files: Entire repository
      Verify: All three subsystems (backend, frontend, docs) functional and complete

## Notes

- **Test files**: All *.test.ts files stay in backend/src/ subdirectories (colocated with source, per project convention)
- **SDK**: Moves to backend/sdk/typescript/ (part of backend monorepo structure)
- **Windows environment**: Running on Windows, so actual Firecracker/KVM functionality cannot be tested. Focus on build, tests, and structure.
- **No build tools for frontend**: Pure vanilla HTML/CSS/JS, no npm, no bundler
- **Single documentation file**: Only docs/RELEASE.md is created (requirement: one comprehensive file, not multiple)
- **License**: AGPL-3.0 (stays at root, copied to backend for distribution)
