import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // `pnpm dev` talks to `pnpm dev:worker` (wrangler on :8787) for /api.
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'worker/**/*.test.ts'],
    maxWorkers: 1,
    css: { include: [/tokens\.css/] },
    watch: false,
  },
});
