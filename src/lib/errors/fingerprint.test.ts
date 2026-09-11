import { describe, expect, it } from 'vitest';
import { fingerprint, scrub } from './fingerprint';

describe('grouping', () => {
  it('treats the same failure against different addresses as one problem', () => {
    // Without this the count never rises above one, and the count is the only
    // number that says whether this is a blip or a flood.
    expect(fingerprint('documents', 'could not reach 10.0.0.4')).toBe(
      fingerprint('documents', 'could not reach 10.0.0.9'),
    );
  });

  it('collapses identifiers, so one failing loop is one row', () => {
    const a = 'row 3f0a9c11-1b73-46bc-a2b8-b1b87bf2cb6c was not found';
    const b = 'row 91827364-aaaa-4bbb-8ccc-ddddeeeeffff was not found';
    expect(fingerprint('imprint', a)).toBe(fingerprint('imprint', b));
  });

  it('keeps genuinely different problems apart', () => {
    expect(fingerprint('billing', 'the card was declined')).not.toBe(
      fingerprint('billing', 'the customer does not exist'),
    );
  });

  it('keeps the same words in different parts of the system apart', () => {
    // "timed out" in billing and "timed out" in the Twin are two problems with
    // two remedies, and merging them would hide one behind the other.
    expect(fingerprint('billing', 'timed out')).not.toBe(fingerprint('twin', 'timed out'));
  });
});

describe('scrubbing', () => {
  it('keeps the host of a connection string and drops the password', () => {
    // Which host was unreachable is the diagnostic. The password is the risk.
    const scrubbed = scrub('connect ECONNREFUSED postgresql://amryn:hunter2@db.example.co:5432/main');
    expect(scrubbed).toContain('db.example.co');
    expect(scrubbed).not.toContain('hunter2');
  });

  it('removes a token however it was introduced', () => {
    for (const raw of [
      'Authorization: Bearer sk-live-abcdefghijklmnop',
      'apikey=sk-live-abcdefghijklmnop',
      'the secret: sk-live-abcdefghijklmnop',
    ]) {
      expect(scrub(raw), raw).not.toContain('sk-live-abcdefghijklmnop');
    }
  });

  it('removes anything long and random enough to be a credential on its own', () => {
    // No label, no scheme, just a string in a message. Breadth is the point:
    // a useful word wrongly removed costs clarity, a key wrongly kept costs
    // the key.
    const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdefgh';
    expect(scrub(`upstream said ${key}`)).not.toContain(key);
  });

  it('removes an email address, which is somebody personal information', () => {
    const scrubbed = scrub('could not invite daniel@example.co.za');
    expect(scrubbed).not.toContain('daniel@example.co.za');
    expect(scrubbed).toContain('<email>');
  });

  it('leaves an ordinary message readable', () => {
    // The whole point is a person reading this and knowing what broke.
    expect(scrub('We could not save those stock lines.')).toBe(
      'We could not save those stock lines.',
    );
  });

  it('bounds what it stores, because a stack trace is not a message', () => {
    expect(scrub('x'.repeat(5000)).length).toBeLessThanOrEqual(1000);
  });
});
