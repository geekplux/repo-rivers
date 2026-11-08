import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { notFoundPage } from './scripts/not-found-page.ts';

export default defineConfig({
  // notFoundPage: dist/404.html, what an unknown path gets at status 404 (scripts/not-found-page.ts).
  plugins: [react(), notFoundPage()],
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
