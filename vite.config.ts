import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    maxWorkers: 1,
    watch: false,
  },
});
