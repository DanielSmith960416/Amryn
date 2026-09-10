import { describe, expect, it } from 'vitest';
import {
  CONNECTORS,
  byCategory,
  connector,
  connectorsFor,
  isConnectable,
  planReaches,
  storedCategory,
} from './catalogue';
import { ENTITLEMENTS } from '@/lib/billing/access';

/**
 * The catalogue is a declaration, so most of it cannot be wrong in a way a
 * test would catch. Three things can, and all three would be discovered by a
 * customer rather than by us.
 */

describe('the catalogue', () => {
  it('has no duplicate ids, because the id is written to connection rows', () => {
    const ids = CONNECTORS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('names only entitlements that exist', () => {
    // A gate naming a key the entitlement engine has never heard of does not
    // fail loudly — it resolves to "not included" and quietly hides a
    // connector the customer has paid for.
    for (const c of CONNECTORS) {
      if (c.entitlement === null) continue;
      expect(ENTITLEMENTS, `${c.id} names ${c.entitlement}`).toContain(c.entitlement);
    }
  });

  it('maps every category onto one the database enum already accepts', () => {
    const allowed = ['accounting', 'crm', 'pos', 'erp', 'spreadsheet', 'database', 'api', 'manual'];
    for (const c of CONNECTORS) {
      expect(allowed, `${c.id} stores as ${storedCategory(c)}`).toContain(storedCategory(c));
    }
  });
});

describe('an unconfirmed connector', () => {
  /*
   * The rule this file exists to enforce. Nothing in the catalogue has been
   * checked against a provider's own documentation yet, so nothing may be
   * switched on — and when the first one is confirmed, this test is what stops
   * the second being marked available by copying the first.
   */
  it('is never connectable, however its status is set', () => {
    for (const c of CONNECTORS) {
      if (c.verification === 'unconfirmed') {
        expect(isConnectable(c), `${c.id} is unconfirmed and must not be connectable`).toBe(false);
      }
    }
  });

  it('cannot be marked available at all', () => {
    const contradiction = CONNECTORS.filter(
      (c) => c.status === 'available' && c.verification === 'unconfirmed',
    );
    expect(contradiction.map((c) => c.id)).toEqual([]);
  });

  it('carries no source, because there is nothing to cite', () => {
    for (const c of CONNECTORS) {
      if (c.verification === 'unconfirmed') {
        expect(c.capabilitiesSource, `${c.id}`).toBeNull();
      }
    }
  });

  it('and a confirmed one must say where it was checked', () => {
    for (const c of CONNECTORS) {
      if (c.verification === 'confirmed') {
        expect(c.capabilitiesSource, `${c.id} is confirmed but cites nothing`).toBeTruthy();
      }
    }
  });
});

describe('planReaches', () => {
  const sage = connector('sage')!;
  const sap = connector('sap')!;
  const powerBi = connector('power_bi')!;

  it('lets a tier reach its own level and everything below', () => {
    expect(planReaches('growth', sage)).toBe(true);
    expect(planReaches('professional', sage)).toBe(true);
    expect(planReaches('enterprise', sage)).toBe(true);
  });

  it('stops a tier reaching above itself', () => {
    expect(planReaches('starter', sage)).toBe(false);
    expect(planReaches('growth', powerBi)).toBe(false);
    expect(planReaches('professional', sap)).toBe(false);
  });

  it('gives Enterprise everything', () => {
    expect(connectorsFor('enterprise')).toHaveLength(CONNECTORS.length);
  });

  it('gives Starter nothing yet, which is a commercial finding and not a bug', () => {
    // Recorded rather than quietly fixed. The brief places Sage and Xero at
    // Growth, and every other connector at Growth or above, so a Starter
    // customer paying R1,499 can connect no live system — only file imports,
    // which need no connector. Worth a decision; not one to make here.
    expect(connectorsFor('starter')).toEqual([]);
  });
});

describe('byCategory', () => {
  it('loses nothing', () => {
    const total = [...byCategory().values()].reduce((n, list) => n + list.length, 0);
    expect(total).toBe(CONNECTORS.length);
  });

  it('keeps the South African payment gateways together', () => {
    const payments = byCategory().get('payments') ?? [];
    expect(payments.map((c) => c.id)).toEqual(['paystack', 'yoco', 'payfast', 'peach_payments']);
  });
});

describe('connector', () => {
  it('finds one by id', () => {
    expect(connector('xero')?.name).toBe('Xero');
  });

  it('returns null rather than throwing for an id nobody recognises', () => {
    expect(connector('quickbooks')).toBeNull();
  });
});
