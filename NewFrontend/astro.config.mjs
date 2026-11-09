import { defineConfig } from 'astro/config';

// Vercel serves the site from the domain root; GitHub Pages serves it under
// the repository path. Vercel sets VERCEL=1 during builds.
const onVercel = Boolean(process.env.VERCEL);
const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;

export default defineConfig({
  site: onVercel && vercelHost ? `https://${vercelHost}` : 'https://sheerwill007.github.io',
  base: onVercel ? '/' : '/Agent-Sandbox',
  output: 'static',
  build: { format: 'directory' },
});
