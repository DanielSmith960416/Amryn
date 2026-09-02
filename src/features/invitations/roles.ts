import type { Database } from '@/types/database';

type OrgRole = Database['public']['Enums']['org_role'];

/**
 * Roles an administrator may hand out.
 *
 * super_admin is deliberately absent: it is the platform-wide role, and an
 * organisation administrator inviting someone into it would be an escalation
 * from tenant to platform. The list is a whitelist rather than the enum minus
 * one, so a role added later has to be considered before it can be granted.
 *
 * In its own module because a `'use server'` file may export nothing but async
 * functions — a constant exported alongside the actions fails the build with
 * "A 'use server' file can only export async functions".
 */
export const INVITABLE_ROLES = [
  'org_admin',
  'executive',
  'regional_manager',
  'branch_manager',
  'department_manager',
  'analyst',
  'viewer',
] as const satisfies readonly OrgRole[];

export type InvitableRole = (typeof INVITABLE_ROLES)[number];

/**
 * How long an invitation stays valid.
 *
 * Must match the `expires_at` default in migration 11. Kept here so the email
 * and the interface can say it without either guessing.
 */
export const INVITATION_DAYS = 14;
