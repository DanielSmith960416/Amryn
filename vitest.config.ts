import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * `server-only` is a build-time guard, not a runtime one: it resolves to a
 * module that throws so that a server module imported into a client bundle
 * fails loudly. Vitest has no client/server boundary to enforce, so it resolves
 * the throwing build and every server module becomes untestable.
 *
 * Aliasing it to its own server entry keeps the guard doing its real job in
 * `next build` while letting the auth modules be tested here.
 */
const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
  'server-only': fileURLToPath(new URL('./node_modules/server-only/empty.js', import.meta.url)),
};

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
          include: ['src/**/*.test.ts'],
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
