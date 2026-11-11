import { readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',
  site: 'https://xn--brutnalften-xfb.se',
  base: '/',
  // Old promise pages that were split into several promises (tools/split-promises.ts).
  redirects: JSON.parse(
    readFileSync(new URL('./src/data/promise-redirects.json', import.meta.url), 'utf-8'),
  ),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});
