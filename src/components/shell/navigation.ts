/**
 * The client area's information architecture, as data.
 *
 * It follows the prototype's HOME sheet, which is the navigation the product
 * was designed around: Executive Command, DigitalTwin®, OpportunityRadar®,
 * Risk Radar, Action Centre, KPI Centre, the intelligence modules, Advanced
 * Inventory Control and the reports.
 *
 * The previous build gated every entry on one of thirty permissions across
 * eight roles. This build has no role hierarchy — the brief asks for a website
 * that acts like an app, not a multi-tenant SaaS on day one — so every signed-in
 * reader sees the whole workspace. When roles are needed, a `permission` field
 * returns here and `visibleGroups` filters on it; nothing else moves.
 */

export interface NavItem {
  label: string;
  href: string;
  /** Rendered as a superscript that never scales with the surrounding text. */
  trademark?: '®' | '™';
  /** One line, shown in the mobile drawer where there is room to explain. */
  hint?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Command',
    items: [
      {
        label: 'Executive Command Centre',
        href: '/command-centre',
        hint: 'What matters this week',
      },
      { label: 'Action Centre', href: '/action-centre', hint: 'Every action has an owner' },
      { label: 'Decision Log', href: '/decision-log', hint: 'Organisational memory' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      {
        label: 'DigitalTwin',
        href: '/digital-twin',
        trademark: '®',
        hint: 'The business, modelled',
      },
      {
        label: 'OpportunityRadar',
        href: '/opportunity-radar',
        trademark: '®',
        hint: 'Scored growth openings',
      },
      { label: 'Risk Radar', href: '/risk-radar', hint: 'Register and exposure' },
      { label: 'Market & Competitors', href: '/market', hint: 'The view outside' },
    ],
  },
  {
    label: 'Performance',
    items: [
      { label: 'Financial Intelligence', href: '/financial', hint: 'Month by month' },
      { label: 'KPI Centre', href: '/kpi-centre', hint: 'Current against target' },
      { label: 'Forecast', href: '/forecast', hint: 'Projection, not guarantee' },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        label: 'Advanced Inventory Control',
        href: '/inventory',
        hint: 'Compliance, audit log and stock intelligence',
      },
    ],
  },
  {
    label: 'Reporting',
    items: [
      { label: 'Weekly & Monthly Briefs', href: '/reports', hint: 'Download the executive PDF' },
      { label: 'Settings', href: '/settings', hint: 'Profile and data sources' },
    ],
  },
];

/** The five that fit across the top bar on a desktop. */
export const PRIMARY_NAV: NavItem[] = [
  { label: 'Command Centre', href: '/command-centre' },
  { label: 'DigitalTwin', href: '/digital-twin', trademark: '®' },
  { label: 'OpportunityRadar', href: '/opportunity-radar', trademark: '®' },
  { label: 'Inventory', href: '/inventory' },
  { label: 'Reports', href: '/reports' },
];

/**
 * Whether a nav entry should read as current.
 *
 * Exact match, or a path segment below it — so `/inventory/audit-log` lights
 * `/inventory`, while `/reports` does not light `/report-builder`.
 */
export function isActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
