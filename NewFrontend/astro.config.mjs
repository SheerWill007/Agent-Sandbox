import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://sheerwill007.github.io',
  base: '/Agent-Sandbox',
  output: 'static',
  build: { format: 'directory' },
});
