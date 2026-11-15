import { defineConfig } from 'vitest/config';
// Tests start a local workerd (real D1) per file through wrangler's getPlatformProxy, so hooks get extra time.
export default defineConfig({ test: { include: ['test/**/*.test.ts'], testTimeout: 30_000, hookTimeout: 60_000 } });
