import { describe, expect, it } from 'vitest';
import { isKeyRejection, isPermissionDenied, isSchemaCacheMiss } from './errors';

/**
 * The messages below are the ones PostgREST actually produced against the live
 * deployment, not invented examples.
 */
describe('isPermissionDenied', () => {
  it('recognises the refusal a correctly secured database gives', () => {
    // Verbatim from /diagnostics on the Railway deployment, signed out.
    // `permissions` is granted to authenticated and service_role, never anon.
    expect(isPermissionDenied('permission denied for table permissions')).toBe(true);
    expect(isPermissionDenied('42501')).toBe(true);
    expect(isPermissionDenied('permission denied for schema public')).toBe(true);
  });

  it('does not swallow the failures that are real', () => {
    // If any of these read as a privilege refusal, a genuine outage would be
    // reported as a healthy deployment — the opposite mistake, and worse.
    expect(isPermissionDenied('Invalid API key')).toBe(false);
    expect(isPermissionDenied('Could not find the table in the schema cache')).toBe(false);
    expect(isPermissionDenied('relation "public.permissions" does not exist')).toBe(false);
    expect(isPermissionDenied('fetch failed')).toBe(false);
    expect(isPermissionDenied(undefined)).toBe(false);
    expect(isPermissionDenied('')).toBe(false);
  });
});

describe('the three classifiers do not overlap', () => {
  // Each drives a different remedy, and the reachability check tests them in
  // order. Two matching one message would print advice for the wrong fault.
  const cases: Array<[string, 'denied' | 'key' | 'cache' | 'none']> = [
    ['permission denied for table permissions', 'denied'],
    ['Invalid API key', 'key'],
    ['No API key found in request', 'key'],
    ["Could not find the table 'public.stock_items' in the schema cache", 'cache'],
    ['relation "public.permissions" does not exist', 'none'],
    ['fetch failed', 'none'],
  ];

  it.each(cases)('classifies %j as %s and nothing else', (message, expected) => {
    const hits = {
      denied: isPermissionDenied(message),
      key: isKeyRejection(message),
      cache: isSchemaCacheMiss(message),
    };
    const matched = Object.entries(hits)
      .filter(([, hit]) => hit)
      .map(([name]) => name);

    expect(matched).toEqual(expected === 'none' ? [] : [expected]);
  });
});
