import type { Permission } from '@/lib/auth/permissions';

/**
 * The information architecture from specification §6, as data.
 *
 * Navigation is generated from this, and each entry names the permission it
 * needs. A user never sees a section they cannot open — which matters more
 * than it sounds: a nav full of dead ends teaches people the product is
 * broken.
 */
export interface NavItem {
  label: string;
  href: string;
  permission?: Permission;
  /** Rendered with the trademark superscript. */
  trademark?: '®' | '™';
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const PRIMARY_NAV: NavItem[] = [
  { label: 'Command Centre', href: '/command-centre' },
  { label: 'DigitalTwin', href: '/digital-twin', permission: 'view_intelligence', trademark: '®' },
  { label: 'OpportunityRadar', href: '/opportunity-radar', permission: 'view_opportunities', trademark: '®' },
  { label: 'Performance', href: '/performance', permission: 'view_performance' },
  { label: 'Strategy', href: '/strategy', permission: 'view_goals' },
];

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Intelligence',
    items: [
      { label: 'AI DigitalTwin', href: '/digital-twin', permission: 'view_intelligence', trademark: '®' },
      { label: 'AI OpportunityRadar', href: '/opportunity-radar', permission: 'view_opportunities', trademark: '®' },
      { label: 'Intelligence Feed', href: '/intelligence-feed', permission: 'view_intelligence' },
      { label: 'Market Intelligence', href: '/market-intelligence', permission: 'view_market_intelligence' },
      { label: 'Competitor Intelligence', href: '/competitors', permission: 'view_competitors' },
    ],
  },
  {
    label: 'Performance',
    items: [
      { label: 'Business Overview', href: '/performance', permission: 'view_performance' },
      { label: 'Financial Performance', href: '/performance/financial', permission: 'view_financial_data' },
      { label: 'Sales Performance', href: '/performance/sales', permission: 'view_sales_data' },
      { label: 'Operations', href: '/performance/operations', permission: 'view_operations_data' },
      { label: 'Branch Performance', href: '/performance/branches', permission: 'view_performance' },
    ],
  },
  {
    label: 'Opportunities',
    items: [
      { label: 'Opportunity Pipeline', href: '/opportunities', permission: 'view_opportunities' },
      { label: 'Saved Opportunities', href: '/opportunities/saved', permission: 'view_opportunities' },
    ],
  },
  {
    label: 'Strategy',
    items: [
      { label: 'Goals', href: '/strategy', permission: 'view_goals' },
      { label: 'Strategic Initiatives', href: '/strategy/initiatives', permission: 'view_goals' },
      { label: 'Recommendations', href: '/recommendations', permission: 'view_recommendations' },
    ],
  },
  {
    label: 'Risk',
    items: [
      { label: 'Risk Dashboard', href: '/risk', permission: 'view_risks' },
      { label: 'Alerts', href: '/alerts', permission: 'view_alerts' },
      { label: 'Risk Register', href: '/risk/register', permission: 'view_risks' },
    ],
  },
  {
    label: 'Data',
    items: [
      { label: 'Connected Sources', href: '/data', permission: 'view_data_sources' },
      { label: 'Data Imports', href: '/data/imports', permission: 'view_data_sources' },
      { label: 'Data Health', href: '/data/health', permission: 'view_data_sources' },
    ],
  },
  {
    label: 'Reporting',
    items: [{ label: 'Reports', href: '/reports', permission: 'generate_reports' }],
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

/** Drops anything the reader cannot open, and any group left empty. */
export function visibleGroups(permissions: ReadonlySet<Permission>): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || permissions.has(item.permission)),
  })).filter((group) => group.items.length > 0);
}

export function visiblePrimary(permissions: ReadonlySet<Permission>): NavItem[] {
  return PRIMARY_NAV.filter((item) => !item.permission || permissions.has(item.permission));
}
