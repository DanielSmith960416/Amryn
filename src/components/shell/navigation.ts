import type { Permission } from '@/lib/auth/permissions';
import type { Entitlement, Entitlements } from '@/lib/billing/access';

/**
 * The information architecture, as data.
 *
 * Two things are true of every entry and both matter. It names the permission
 * it needs, so a user never sees a section they cannot open — a nav full of
 * dead ends teaches people the product is broken. And it carries a one-line
 * hint, shown in the mobile drawer where there is room to say what a
 * destination is for.
 *
 * ── merged from two lineages ──────────────────────────────────────────────
 * The destinations below come from the v2 information architecture: Action
 * Centre, Decision Log, Risk Radar, Financial Intelligence, KPI Centre,
 * Forecast and Advanced Inventory Control were added there, and the grouping
 * (Command / Intelligence / Performance / Operations / Reporting) is its.
 *
 * The permission on each entry comes from the platform's RBAC, which the v2
 * work did not have because it had no server to enforce anything. Keeping both
 * is the point: the newer map of the product, gated by the older — and real —
 * access control. An entry with no permission is open to every member.
 */
export interface NavItem {
  label: string;
  href: string;
  /** Omitted means every member of an organisation may open it. */
  permission?: Permission;
  /** Rendered as a superscript that never scales with the surrounding text. */
  trademark?: '®' | '™';
  /** One line, shown in the mobile drawer where there is room to explain. */
  hint?: string;
  /** What the plan has to include. Omitted means every plan carries it. */
  entitlement?: Entitlement;
  /** Set by visibleGroups(): in the plan's reach, but not bought. */
  locked?: boolean;
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
      {
        label: 'Action Centre',
        href: '/action-centre',
        permission: 'view_recommendations',
        hint: 'Every action has an owner',
      },
      {
        label: 'Decision Log',
        href: '/decision-log',
        permission: 'view_goals',
        hint: 'Organisational memory',
      },
      { label: 'Alerts', href: '/alerts', permission: 'view_alerts', hint: 'What changed, and when' },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      {
        label: 'DigitalTwin',
        href: '/digital-twin',
        permission: 'view_intelligence',
        trademark: '®',
        hint: 'The business, modelled',
      },
      {
        label: 'OpportunityRadar',
        href: '/opportunity-radar',
        permission: 'view_opportunities',
        entitlement: 'opportunity_pipeline',
        trademark: '®',
        hint: 'Scored growth openings',
      },
      {
        label: 'Risk Radar',
        href: '/risk-radar',
        permission: 'view_risks',
        entitlement: 'risk_radar',
        hint: 'Register and exposure',
      },
      {
        label: 'Market & Competitors',
        href: '/market',
        permission: 'view_market_intelligence',
        entitlement: 'market_intelligence',
        hint: 'The view outside',
      },
      {
        label: 'Intelligence Feed',
        href: '/intelligence-feed',
        permission: 'view_intelligence',
        hint: 'Signals as they arrive',
      },
      {
        label: 'Assistant',
        href: '/assistant',
        permission: 'view_intelligence',
        entitlement: 'ai_assistant',
        hint: 'Ask about your own numbers',
      },
    ],
  },
  {
    label: 'Performance',
    items: [
      {
        label: 'Financial Intelligence',
        href: '/financial',
        permission: 'view_financial_data',
        entitlement: 'financial_intelligence',
        hint: 'Month by month',
      },
      {
        label: 'KPI Centre',
        href: '/kpi-centre',
        permission: 'view_performance',
        hint: 'Current against target',
      },
      {
        label: 'Forecast',
        href: '/forecast',
        permission: 'view_performance',
        hint: 'Projection, not guarantee',
      },
      {
        label: 'Business Overview',
        href: '/performance',
        permission: 'view_performance',
        hint: 'Every division at once',
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      {
        label: 'Advanced Inventory Control',
        href: '/inventory',
        permission: 'view_operations_data',
        hint: 'Compliance, audit log and stock intelligence',
      },
      {
        label: 'Import a stocktake',
        href: '/inventory/import',
        permission: 'manage_inventory',
        hint: 'Turn a counted spreadsheet into a stocktake',
      },
      {
        label: 'Data Sources',
        href: '/data',
        permission: 'view_data_sources',
        hint: 'What is connected, and how healthy',
      },
    ],
  },
  {
    label: 'Reporting',
    items: [
      {
        label: 'Weekly & Monthly Briefs',
        href: '/reports',
        hint: 'Download the executive brief',
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Organisation', href: '/settings/organisation', permission: 'manage_organisation' },
      { label: 'Users', href: '/settings/users', permission: 'manage_users' },
      { label: 'Roles & Permissions', href: '/settings/roles', permission: 'manage_users' },
      { label: 'Billing', href: '/settings/billing', permission: 'manage_billing' },
      { label: 'Settings', href: '/settings' },
    ],
  },
];

/** The five that fit across the top bar on a desktop. */
export const PRIMARY_NAV: NavItem[] = [
  { label: 'Command Centre', href: '/command-centre' },
  { label: 'DigitalTwin', href: '/digital-twin', permission: 'view_intelligence', trademark: '®' },
  {
    label: 'OpportunityRadar',
    href: '/opportunity-radar',
    permission: 'view_opportunities',
    entitlement: 'opportunity_pipeline',
    trademark: '®',
  },
  { label: 'Inventory', href: '/inventory', permission: 'view_operations_data' },
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

/**
 * Drops anything the reader cannot open, marks anything the plan has not
 * bought, and drops any group left empty.
 *
 * `entitlements` is optional so that a caller which has not resolved them —
 * or a deployment where the catalogue could not be read — gets the old
 * behaviour rather than a navigation where every entry looks locked.
 */
export function visibleGroups(
  permissions: ReadonlySet<Permission>,
  entitlements?: Entitlements,
): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items
      .filter((item) => !item.permission || permissions.has(item.permission))
      .map((item) => ({ ...item, locked: isLocked(item, entitlements) })),
  })).filter((group) => group.items.length > 0);
}

export function visiblePrimary(
  permissions: ReadonlySet<Permission>,
  entitlements?: Entitlements,
): NavItem[] {
  return PRIMARY_NAV.filter((item) => !item.permission || permissions.has(item.permission)).map(
    (item) => ({ ...item, locked: isLocked(item, entitlements) }),
  );
}

function isLocked(item: NavItem, entitlements?: Entitlements): boolean {
  if (!item.entitlement || !entitlements) return false;
  return !entitlements.has(item.entitlement);
}
