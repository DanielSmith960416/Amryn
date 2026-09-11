/**
 * Whether one organisation may connect one system — the rules alone.
 *
 * Four separate questions, deliberately kept apart, because they fail for
 * different reasons and the customer needs a different sentence for each. That
 * is the same discipline access.ts applies to entitlements, and for the same
 * reason: a single boolean would leave the interface saying "you cannot do
 * this" without saying what would make it possible.
 *
 *   · The plan does not reach it       → an upgrade, and it was never there.
 *   · The plan reaches it, the feature is not included
 *                                      → also an upgrade, but a different one,
 *                                        and worth naming separately because
 *                                        Enterprise systems are gated by a
 *                                        feature rather than by tier alone.
 *   · Every connection is in use       → nothing to buy; disconnect one, or
 *                                        move up a tier for more room.
 *   · Amryn cannot connect it yet      → nothing the customer can do at all,
 *                                        and the only honest thing is to say
 *                                        so rather than offer a button that
 *                                        fails.
 *
 * No `server-only` and no database client: this file is the rules and nothing
 * else, so a unit test and a client component can both read it. The counting
 * lives next door.
 */
import type { Entitlements } from '@/lib/billing/access';
import type { Plan } from '@/lib/billing/access';
import { isConnectable, planReaches, type ConnectorDefinition } from './catalogue';

/** Why a connector cannot be added, or that it can. */
export type ConnectDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: 'plan' | 'entitlement' | 'quota' | 'unavailable';
      /** Said to the customer, in their language. */
      detail: string;
      /** What would change the answer. Absent where nothing they can do would. */
      remedy?: string;
    };

export interface ConnectContext {
  plan: Plan;
  entitlements: Entitlements;
  /** Connections the organisation already holds, however healthy. */
  used: number;
}

/**
 * The order the questions are asked in is not arbitrary.
 *
 * "Amryn cannot connect this yet" comes first, because it is true regardless
 * of what the customer has bought and telling somebody to upgrade to reach a
 * connector that does not work would be the wrong remedy for the wrong
 * problem — and the kind of mistake that gets found on an invoice.
 *
 * Quota comes last, because it is the only one that is not about this
 * connector at all. Somebody who has filled every slot should be told that,
 * not told their plan is short of a feature it actually carries.
 */
export function mayConnect(
  definition: ConnectorDefinition,
  context: ConnectContext,
): ConnectDecision {
  if (!isConnectable(definition)) {
    return {
      allowed: false,
      reason: 'unavailable',
      detail: `${definition.name} is not ready to connect yet.`,
      // No remedy. Nothing the customer does changes this, and inventing an
      // action for them would waste their time.
    };
  }

  if (!planReaches(context.plan, definition)) {
    return {
      allowed: false,
      reason: 'plan',
      detail: `${definition.name} is part of ${titleCase(definition.minimumPlan)} and above.`,
      remedy: `Moving to ${titleCase(definition.minimumPlan)} adds it, along with everything else on that tier.`,
    };
  }

  if (definition.entitlement && !context.entitlements.has(definition.entitlement)) {
    return {
      allowed: false,
      reason: 'entitlement',
      detail: `Your plan does not include ${definition.name}.`,
      remedy: 'Enterprise systems are arranged as part of a contract. Speak to us and we will set it up.',
    };
  }

  /*
   * has() before limit(), and the order is load-bearing.
   *
   * limit() returns null for two different states — "no ceiling" and "this
   * plan does not sell connections at all" — which access.ts says explicitly
   * and which this code originally ignored. Reading the second as the first
   * fails open: a plan carrying no connection quota would have been given
   * unlimited connections. A unit test caught it; a customer would have
   * caught it later and cheaper for them than for us.
   */
  if (!context.entitlements.has('data_sources')) {
    return {
      allowed: false,
      reason: 'quota',
      detail: 'Your plan does not include connected systems.',
      // Deliberately does not name a tier. Every plan sold today carries a
      // connection quota, so this branch is unreachable — and a sentence that
      // names Growth would be wrong the moment it ran, now that a payment
      // gateway starts at Starter.
      remedy: 'A plan with connections brings your systems in directly, rather than by file.',
    };
  }

  const ceiling = context.entitlements.limit('data_sources');
  if (ceiling !== null && context.used >= ceiling) {
    return {
      allowed: false,
      reason: 'quota',
      detail: `You are using all ${ceiling} of your connections.`,
      remedy:
        'Disconnect one you no longer need, or move up a tier for more. Disconnecting keeps everything already brought in.',
    };
  }

  return { allowed: true };
}

/**
 * How much room is left, for the sentence on the page rather than a decision.
 *
 * Null means no ceiling. Returned separately from mayConnect because the page
 * says "6 of 8 connections used" whether or not anybody is trying to add one,
 * and computing that by calling the decision function would be answering a
 * question nobody asked.
 */
export function connectionsRemaining(context: ConnectContext): number | null {
  // Same trap as above: a plan that does not sell connections has none left,
  // not unlimited.
  if (!context.entitlements.has('data_sources')) return 0;
  const ceiling = context.entitlements.limit('data_sources');
  if (ceiling === null) return null;
  return Math.max(0, ceiling - context.used);
}

function titleCase(plan: Plan): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}
