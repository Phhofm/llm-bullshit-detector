import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    setupFiles: [],
    poolOptions: {
      threads: { minThreads: 1, maxThreads: 1 }
    }
  }
});