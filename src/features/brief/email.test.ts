import { describe, expect, it } from 'vitest';
import { SECTION_LABEL } from './compose';
import { ALL_SECTIONS, renderBriefEmail, type BriefEmailInput } from './email';

function input(over: Partial<BriefEmailInput> = {}): BriefEmailInput {
  return {
    organisationName: 'Highveld Supply Co',
    briefDate: '2026-09-07',
    items: [
      {
        rank: 1,
        section: 'today',
        headline: 'Reorder the fast-moving lines in Polokwane',
        detail: 'Stock cover is under two weeks.',
        impactCents: 120_000_00,
        provenance: 'estimated',
        sourceTable: 'ai_recommendations',
        sourceId: '11111111-1111-4111-8111-111111111111',
      },
    ],
    empty: [],
    ...over,
  };
}

describe('renderBriefEmail', () => {
  it('names the source record in both parts, because the email is where a figure travels furthest', () => {
    const mail = renderBriefEmail(input());
    expect(mail.text).toContain('ai_recommendations');
    expect(mail.text).toContain('11111111-1111-4111-8111-111111111111');
    expect(mail.html).toContain('ai_recommendations');
    expect(mail.html).toContain('11111111-1111-4111-8111-111111111111');
  });

  it('leads the subject with the most important item rather than the date', () => {
    expect(renderBriefEmail(input()).subject).toBe(
      'Highveld Supply Co — Reorder the fast-moving lines in Polokwane',
    );
  });

  it('says plainly when there is nothing, rather than sending a blank frame', () => {
    const mail = renderBriefEmail(input({ items: [] }));
    expect(mail.subject).toContain('nothing to report');
    expect(mail.text).toContain('Nothing needed your attention');
    expect(mail.html).toContain('Nothing needed your attention');
  });

  it('distinguishes what was looked at from what was skipped', () => {
    const mail = renderBriefEmail(
      input({ empty: [{ section: 'radar', reason: 'Nothing to report.' }] }),
    );
    expect(mail.text).toContain('Looked at and found nothing');
    expect(mail.text).toContain('Radar');
  });

  it('orders by rank whatever order it is handed', () => {
    const items = [
      { ...input().items[0]!, rank: 3, headline: 'Third' },
      { ...input().items[0]!, rank: 1, headline: 'First' },
      { ...input().items[0]!, rank: 2, headline: 'Second' },
    ];
    const text = renderBriefEmail(input({ items })).text;
    expect(text.indexOf('First')).toBeLessThan(text.indexOf('Second'));
    expect(text.indexOf('Second')).toBeLessThan(text.indexOf('Third'));
  });

  it('escapes item text, because a market signal came from outside the platform', () => {
    const mail = renderBriefEmail(
      input({
        items: [
          {
            ...input().items[0]!,
            headline: '<script>alert(1)</script>',
            detail: "O'Reilly & Sons \"expanded\"",
          },
        ],
      }),
    );

    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).toContain('&amp;');
    expect(mail.html).toContain('&#39;');
  });

  it('escapes the organisation name too', () => {
    const mail = renderBriefEmail(input({ organisationName: 'Smith & <b>Co</b>' }));
    expect(mail.html).toContain('Smith &amp; &lt;b&gt;Co&lt;/b&gt;');
  });

  it('omits the link when no site URL is configured, rather than linking nowhere', () => {
    expect(renderBriefEmail(input()).text).not.toContain('Read it in full');
    expect(renderBriefEmail(input({ url: 'https://example.com/brief' })).text).toContain(
      'Read it in full: https://example.com/brief',
    );
  });

  it('has a label for every section a brief can carry', () => {
    for (const section of ALL_SECTIONS) {
      expect(SECTION_LABEL[section]).toBeTruthy();
    }
  });

  it('says in both parts that nothing was written by a model', () => {
    const mail = renderBriefEmail(input());
    expect(mail.text).toContain('Nothing here is written by a model');
    expect(mail.html).toContain('Nothing here is written by a model');
  });
});
