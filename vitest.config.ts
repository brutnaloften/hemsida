import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    globalSetup: ['./vitest.global-setup.ts'],
    // Some tools/ suites spawn node subprocesses; the 5s default is tight on a loaded CI runner or cold cache.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['src/**/*.test.{ts,tsx}', 'tools/**/*.test.ts'],
  },
});
