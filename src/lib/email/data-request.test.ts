import { describe, expect, it } from 'vitest';
import { buildDataRequestNotice, dataRequestNotice } from './data-request';
import { RESPONSIBLE_PARTY, hasUnfilledDetails } from '@/lib/legal/documents';

const OFFICER = 'information.officer@example.test';

const request = {
  kind: 'deletion',
  requesterEmail: 'someone@example.test',
  note: 'Please remove my contact details.',
  requestedAt: '2026-08-31T09:00:00.000Z',
};

describe('dataRequestNotice', () => {
  it('sends nowhere while the Information Officer is a placeholder', () => {
    // The alternative is mailing "[INFORMATION OFFICER EMAIL]", which fails on
    // every request while looking like it worked.
    if (hasUnfilledDetails()) {
      expect(dataRequestNotice(request)).toBeUndefined();
    } else {
      expect(dataRequestNotice(request)?.to).toBe(RESPONSIBLE_PARTY.informationOfficerEmail);
    }
  });
});

describe('buildDataRequestNotice', () => {
  it('puts the deadline in the subject, where it will be seen', () => {
    // 31 August plus 30 days crosses a month boundary, which is the arithmetic
    // worth checking.
    const notice = buildDataRequestNotice(OFFICER, request);
    expect(notice.subject).toContain('2026-09-30');
    expect(notice.text).toContain('Answer by: 2026-09-30');
  });

  it('carries what the person actually said', () => {
    expect(buildDataRequestNotice(OFFICER, request).text).toContain(
      'Please remove my contact details.',
    );
  });

  it('names who asked, so the request can be answered', () => {
    expect(buildDataRequestNotice(OFFICER, request).text).toContain('someone@example.test');
  });

  it('escapes the note, so a request cannot inject markup into the notice', () => {
    const notice = buildDataRequestNotice(OFFICER, {
      ...request,
      note: '<script>alert(1)</script>',
    });
    expect(notice.html).not.toContain('<script>');
    expect(notice.html).toContain('&lt;script&gt;');
  });

  it('names the kind of request in the subject', () => {
    expect(buildDataRequestNotice(OFFICER, { ...request, kind: 'export' }).subject).toContain(
      'copy of personal information',
    );
    expect(buildDataRequestNotice(OFFICER, { ...request, kind: 'correction' }).subject).toContain(
      'correct',
    );
    expect(buildDataRequestNotice(OFFICER, { ...request, kind: 'unknown' }).subject).toContain(
      'Data subject request',
    );
  });

  it('omits the note section entirely when there is none', () => {
    const notice = buildDataRequestNotice(OFFICER, { ...request, note: null });
    expect(notice.text).not.toContain('What they said');
  });
});
