/**
 * The permission vocabulary, mirrored from the database catalogue.
 *
 * The database is the authority — Row Level Security decides what a query
 * returns, and it does so whatever the application believes. This module gives
 * the application the same vocabulary so that it can hide what a user cannot
 * use and explain refusals properly, rather than showing a control that returns
 * an empty result.
 */
export const PERMISSIONS = [
  'view_performance',
  'view_financial_data',
  'view_sales_data',
  'view_operations_data',
  'view_intelligence',
  'view_market_intelligence',
  'view_competitors',
  'view_opportunities',
  'assign_opportunities',
  'manage_opportunities',
  'view_recommendations',
  'manage_recommendations',
  'view_goals',
  'manage_goals',
  'view_risks',
  'manage_risks',
  'view_alerts',
  'manage_alerts',
  'view_data_sources',
  'import_data',
  'manage_integrations',
  'manage_metrics',
  'manage_competitors',
  'manage_radar',
  'generate_reports',
  'use_ai_assistant',
  'view_audit_log',
  'manage_users',
  'manage_organisation',
  'manage_billing',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

/** Raised when an action is attempted without the permission it requires. */
export class PermissionError extends Error {
  readonly permission: Permission;

  constructor(permission: Permission) {
    super(`This action requires the "${permission}" permission.`);
    this.name = 'PermissionError';
    this.permission = permission;
  }
}

export const ROLE_LABELS: Readonly<Record<string, string>> = {
  super_admin: 'Super administrator',
  org_admin: 'Organisation administrator',
  executive: 'Executive',
  regional_manager: 'Regional manager',
  branch_manager: 'Branch manager',
  department_manager: 'Department manager',
  analyst: 'Analyst',
  viewer: 'Viewer',
};

export const ROLE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  super_admin: 'Full platform access, including support operations.',
  org_admin: 'Everything inside this organisation, including people and billing.',
  executive: 'The whole business, and the decisions that follow from it.',
  regional_manager: 'The assigned regions, and everything inside them.',
  branch_manager: 'The assigned branches.',
  department_manager: 'The assigned departments.',
  analyst: 'Read everything, import data and define metrics. No people or billing.',
  viewer: 'Read the dashboards. Change nothing.',
};
