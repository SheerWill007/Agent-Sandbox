import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');

test('builds the Agent Sandbox homepage with project-specific messaging', () => {
  assert.match(html, /Agent Sandbox — Hardware-isolated execution for AI agents/);
  assert.match(html, /Give every agent/);
  assert.match(html, /Firecracker microVMs/);
  assert.match(html, /TypeScript SDK/);
  assert.match(html, /REST API/);
  assert.match(html, /MCP server/);
});

test('publishes links and assets under the GitHub Pages repository path', () => {
  assert.match(html, /href="\/Agent-Sandbox\/fonts\/fonts\.css"/);
  assert.match(html, /href="\/Agent-Sandbox\/favicon\.svg"/);
  assert.match(html, /github\.com\/SheerWill007\/Agent-Sandbox/);
});

test('does not ship Archify branding or the previous project repository', () => {
  assert.doesNotMatch(html, /Archify|archify|tt-a1i/);
});
