// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearProfile,
  initials,
  readProfile,
  storageAvailable,
  writeProfile,
  type Profile,
} from './profile';

const PROFILE: Profile = {
  fullName: 'Daniel Smith',
  companyName: 'Kalahari Retail Group',
  email: 'owner@example.com',
  since: '2026-08-31T00:00:00.000Z',
};

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('profile storage', () => {
  it('round-trips a profile', () => {
    expect(writeProfile(PROFILE)).toBe(true);
    expect(readProfile()).toEqual(PROFILE);
  });

  it('returns null when nothing has been stored', () => {
    expect(readProfile()).toBeNull();
  });

  it('forgets on demand', () => {
    writeProfile(PROFILE);
    clearProfile();
    expect(readProfile()).toBeNull();
  });

  it('rejects stored junk rather than rendering it', () => {
    // Anyone can write to localStorage from the console, and a half-written
    // value must read as "no workspace", never crash a page.
    for (const junk of ['', 'not json', '{}', '[]', 'null', '{"fullName":123}']) {
      localStorage.setItem('amryn-profile', junk);
      expect(readProfile()).toBeNull();
    }
  });

  it('fills in a missing email and timestamp rather than failing', () => {
    // Email is optional on the form, so an older or hand-made record may not
    // carry one. That is not a reason to lose the whole workspace.
    localStorage.setItem(
      'amryn-profile',
      JSON.stringify({ fullName: 'A B', companyName: 'C' }),
    );
    const found = readProfile();
    expect(found?.fullName).toBe('A B');
    expect(found?.email).toBe('');
    expect(found?.since).toMatch(/^\d{4}-/);
  });
});

describe('when the browser refuses to store anything', () => {
  it('reports the refusal instead of throwing', () => {
    // Private browsing and blocked site data make setItem throw outright, and
    // an exception in a render would take the page down.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    expect(writeProfile(PROFILE)).toBe(false);
    expect(storageAvailable()).toBe(false);
  });

  it('reads as signed out rather than throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('SecurityError');
    });
    expect(readProfile()).toBeNull();
  });

  it('reports storage as available in an ordinary browser', () => {
    expect(storageAvailable()).toBe(true);
    // The probe must not survive its own check.
    expect(localStorage.getItem('__amryn_probe__')).toBeNull();
  });
});

describe('initials', () => {
  it('takes the first and last initial', () => {
    expect(initials('Daniel Smith')).toBe('DS');
    expect(initials('Daniel Peter Smith')).toBe('DS');
  });

  it('handles a single name and stray whitespace', () => {
    expect(initials('Daniel')).toBe('D');
    expect(initials('  Daniel   Smith  ')).toBe('DS');
  });

  it('falls back to a dash rather than rendering nothing', () => {
    expect(initials('')).toBe('—');
    expect(initials('   ')).toBe('—');
  });
});
