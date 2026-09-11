import { describe, expect, it } from 'vitest';

import type { Permission } from '@/lib/auth/permissions';
import { NAV_GROUPS, SECTION_TABS, visibleGroups, visibleTabs } from './navigation';

const ALL = new Set<Permission>([
  'view_data_sources',
  'view_operations_data',
  'manage_inventory',
]);

describe('the sidebar after the collapse', () => {
  /*
   * The complaint that prompted this: a sidebar listing every page of every
   * section is a table of contents, not navigation. Operations held five rows
   * describing two places, and Reporting was a heading over a single link.
   */
  it('gives Operations one row per section rather than one per page', () => {
    const operations = NAV_GROUPS.find((g) => g.label === 'Operations');
    expect(operations?.items.map((i) => i.href)).toEqual(['/inventory', '/data']);
  });

  it('has no group holding a single row', () => {
    for (const group of NAV_GROUPS) {
      expect(group.items.length, group.label).toBeGreaterThan(1);
    }
  });

  it('keeps the briefs reachable, under Performance', () => {
    const performance = NAV_GROUPS.find((g) => g.label === 'Performance');
    expect(performance?.items.some((i) => i.href === '/reports')).toBe(true);
  });

  /*
   * The three the brief asked to leave alone. Worth a test rather than a
   * memory: the next tidy-up of this file will be tempted by all three.
   */
  it('leaves Billing, the Twin and the Radar where they were', () => {
    const hrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).toContain('/settings/billing');
    expect(hrefs).toContain('/digital-twin');
    expect(hrefs).toContain('/digital-twin/scenarios');
    expect(hrefs).toContain('/opportunity-radar');
  });
});

describe('nothing became unreachable', () => {
  /*
   * A collapse that loses a destination is not a collapse, it is a deletion.
   * Every page that used to have a sidebar row still has a way in — as a row,
   * or as a tab on the section it belongs to.
   */
  it('every page taken out of the sidebar is a tab instead', () => {
    const rows = new Set(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href)));
    const tabs = new Set(Object.values(SECTION_TABS).flatMap((t) => t.map((i) => i.href)));

    for (const href of ['/data/imports', '/data/integrations', '/inventory/import']) {
      expect(rows.has(href), `${href} is no longer a row`).toBe(false);
      expect(tabs.has(href), `${href} is not a tab either`).toBe(true);
    }
  });
});

describe('visibleTabs', () => {
  it('shows a member only what they may open', () => {
    const viewer = new Set<Permission>(['view_operations_data']);
    expect(visibleTabs('inventory', viewer).map((t) => t.href)).toEqual([
      '/inventory',
      '/inventory/audit-log',
    ]);
  });

  it('and everything to somebody who may do it all', () => {
    expect(visibleTabs('inventory', ALL)).toHaveLength(3);
    expect(visibleTabs('data', ALL)).toHaveLength(3);
  });

  /*
   * The same rule the sidebar has always followed, and the easiest to lose
   * when tabs are written by hand on each page: a tab that leads to a refusal
   * teaches people the product is broken.
   */
  it('shows nothing at all where the member holds no permission', () => {
    expect(visibleTabs('data', new Set<Permission>())).toEqual([]);
  });

  it('agrees with the sidebar about who may see a section', () => {
    const viewer = new Set<Permission>(['view_data_sources']);
    const groups = visibleGroups(viewer);
    const operations = groups.find((g) => g.label === 'Operations');
    expect(operations?.items.map((i) => i.href)).toEqual(['/data']);
    expect(visibleTabs('data', viewer)).toHaveLength(3);
  });
});
