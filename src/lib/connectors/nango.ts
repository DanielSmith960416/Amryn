import 'server-only';

/**
 * Nango, behind Amryn's connector interface.
 *
 * The marker and nothing else. The implementation is in nango-client.ts, which
 * carries no marker so a unit test can read it — the arrangement smtp.ts has
 * with transport.ts one directory over, and for the same reason: `server-only`
 * is a build-time signal to the React bundler, and vitest is not the React
 * bundler.
 *
 * Importing this file is what stops the adapter reaching a client component.
 * The bundle secret scan in CI is the backstop if it ever does.
 */
export { nangoProvider } from './nango-client';
