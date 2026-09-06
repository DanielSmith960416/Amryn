import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          // scripts/ is plain JavaScript with no build step — the migration
          // runner and the backup have to run from a terminal with nothing
          // installed but Node. Their tests are .mjs for the same reason, and
          // are included here rather than left unrun.
          include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'component',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
        },
      },
    ],
  },
});
