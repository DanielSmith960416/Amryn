import { describe, expect, it } from 'vitest';

import { activeTab, type SectionTab } from './section-tabs';

const DATA: SectionTab[] = [
  { label: 'Sources', href: '/data' },
  { label: 'Files and imports', href: '/data/imports' },
  { label: 'Integrations', href: '/data/integrations' },
];

describe('activeTab', () => {
  it('marks the tab you are on', () => {
    expect(activeTab('/data', DATA)).toBe('/data');
    expect(activeTab('/data/imports', DATA)).toBe('/data/imports');
  });

  /*
   * The one that matters. /data is a prefix of every other tab, so the naive
   * match lights two at once and the section looks like it is in two places.
   */
  it('lets a parent tab lose to its own child', () => {
    expect(activeTab('/data/integrations', DATA)).toBe('/data/integrations');
  });

  it('keeps a child page on its own tab', () => {
    expect(activeTab('/data/integrations/paystack', DATA)).toBe('/data/integrations');
    expect(activeTab('/data/documents/abc-123', DATA)).toBe('/data');
  });

  /*
   * Segment boundaries, not characters. Without the slash a route named
   * /database would light the Sources tab.
   */
  it('matches whole segments', () => {
    expect(activeTab('/database', DATA)).toBeUndefined();
    expect(activeTab('/data-exports', DATA)).toBeUndefined();
  });

  it('marks nothing when you are somewhere else entirely', () => {
    expect(activeTab('/command-centre', DATA)).toBeUndefined();
  });
});
