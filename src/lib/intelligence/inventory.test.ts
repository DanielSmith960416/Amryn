import { describe, expect, it } from 'vitest';
import {
  EXPIRY_THRESHOLDS,
  PHARMACY_PROFILE,
  complianceProfile,
  complianceSummary,
  daysLeft,
  departmentMatrix,
  dormancyClass,
  evaluateStock,
  expiryStatus,
  ownerRecommendations,
  stockReportSections,
  type StockItemInput,
} from './inventory';

/**
 * These assertions pin the workbook's rules, including the boundaries.
 *
 * The boundaries are where a compliance rule actually lives: "≤30 days" is a
 * decision about whether day 30 is critical or merely a warning, and getting it
 * wrong by one day is how stock stays on a shelf it should have left.
 */

const BASE: StockItemInput = {
  productName: 'Test line',
  sku: 'TL-001',
  batchNumber: 'B-001',
  department: 'OTC Medications',
  location: 'A1-01',
  qty: 5,
  expiryDate: '2026-12-31',
  action: 'Left on Shelf',
  actionedBy: 'Auditor',
  dateActioned: '2026-08-21',
  notes: '',
  verified: true,
};

const TODAY = new Date('2026-08-31T00:00:00Z');

describe('expiryStatus', () => {
  it('follows the workbook thresholds', () => {
    expect(expiryStatus(-1)).toBe('EXPIRED');
    expect(expiryStatus(0)).toBe('CRITICAL');
    expect(expiryStatus(30)).toBe('CRITICAL');
    expect(expiryStatus(31)).toBe('WARNING');
    expect(expiryStatus(90)).toBe('WARNING');
    expect(expiryStatus(91)).toBe('CLEAR');
  });

  it('treats the expiry day itself as saleable, not expired', () => {
    // The workbook's test is `days < 0`, so stock is saleable until the date
    // has actually passed. This is the boundary most easily got wrong.
    expect(expiryStatus(0)).toBe('CRITICAL');
    expect(expiryStatus(-0)).toBe('CRITICAL');
  });

  it('uses the exported thresholds rather than repeating the numbers', () => {
    expect(expiryStatus(EXPIRY_THRESHOLDS.critical)).toBe('CRITICAL');
    expect(expiryStatus(EXPIRY_THRESHOLDS.critical + 1)).toBe('WARNING');
    expect(expiryStatus(EXPIRY_THRESHOLDS.warning)).toBe('WARNING');
    expect(expiryStatus(EXPIRY_THRESHOLDS.warning + 1)).toBe('CLEAR');
  });
});

describe('daysLeft', () => {
  it('counts whole days regardless of time of day', () => {
    const today = new Date('2026-08-31T23:59:00Z');
    expect(daysLeft(new Date('2026-09-01T00:00:00Z'), today)).toBe(1);
    expect(daysLeft(new Date('2026-08-31T00:00:00Z'), today)).toBe(0);
    expect(daysLeft(new Date('2026-08-30T00:00:00Z'), today)).toBe(-1);
  });
});

describe('dormancyClass', () => {
  it('classifies by status and recorded action', () => {
    expect(dormancyClass('EXPIRED', 'Removed from Shelf')).toBe('WRITE-OFF');
    expect(dormancyClass('CRITICAL', 'Left on Shelf')).toBe('AT-RISK');
    expect(dormancyClass('WARNING', 'Left on Shelf')).toBe('SLOW-MOVING');
    expect(dormancyClass('CLEAR', 'Left on Shelf')).toBe('DORMANT');
  });

  it('does not call actioned stock dormant', () => {
    expect(dormancyClass('CRITICAL', 'Returned to Supplier')).toBe('ACTIVE');
    expect(dormancyClass('CLEAR', 'Marked Down / Clearance')).toBe('ACTIVE');
  });

  it('lets a real sales feed override the dormancy inference', () => {
    // The workbook infers "no recorded sales" from an item sitting untouched.
    // Where actual movement is known, that inference must lose.
    expect(dormancyClass('CLEAR', 'Left on Shelf', true)).toBe('ACTIVE');
    expect(dormancyClass('CLEAR', 'Left on Shelf', false)).toBe('DORMANT');
  });
});

describe('complianceSummary', () => {
  const items = evaluateStock(
    [
      { ...BASE, sku: 'A', expiryDate: '2026-07-01' }, // expired
      { ...BASE, sku: 'B', expiryDate: '2026-09-10' }, // critical
      { ...BASE, sku: 'C', expiryDate: '2026-11-01' }, // warning
      { ...BASE, sku: 'D', expiryDate: '2027-06-01' }, // clear
      { ...BASE, sku: 'E', expiryDate: '2027-06-01', action: 'Pending Review' },
    ],
    TODAY,
  );

  it('counts each status band', () => {
    const s = complianceSummary(items);
    expect(s.totalItems).toBe(5);
    expect(s.expired).toBe(1);
    expect(s.critical).toBe(1);
    expect(s.warning).toBe(1);
    expect(s.clear).toBe(2);
  });

  it('computes compliance as clear over total, and urgent as expired plus critical', () => {
    const s = complianceSummary(items);
    expect(s.complianceRate).toBeCloseTo(2 / 5);
    expect(s.urgent).toBe(2);
    expect(s.pendingReview).toBe(1);
  });

  it('reports an empty audit as 0% rather than dividing by zero', () => {
    const s = complianceSummary([]);
    expect(s.complianceRate).toBe(0);
    expect(s.totalItems).toBe(0);
  });

  it('sums quantities, not lines, for expired stock', () => {
    const s = complianceSummary(
      evaluateStock([{ ...BASE, qty: 12, expiryDate: '2026-07-01' }], TODAY),
    );
    expect(s.expired).toBe(1);
    expect(s.expiredQty).toBe(12);
  });

  it('values capital at risk across expired and critical lines only', () => {
    const s = complianceSummary(
      evaluateStock(
        [
          { ...BASE, qty: 2, unitCost: 100, expiryDate: '2026-07-01' }, // expired: 200
          { ...BASE, qty: 3, unitCost: 10, expiryDate: '2026-09-10' }, // critical: 30
          { ...BASE, qty: 9, unitCost: 500, expiryDate: '2027-06-01' }, // clear: excluded
        ],
        TODAY,
      ),
    );
    expect(s.valueAtRisk).toBe(230);
  });
});

describe('departmentMatrix', () => {
  const items = evaluateStock(
    [
      { ...BASE, department: 'OTC Medications', expiryDate: '2026-07-01' },
      { ...BASE, department: 'OTC Medications', expiryDate: '2027-06-01' },
      { ...BASE, department: 'Wound Care', expiryDate: '2027-06-01' },
    ],
    TODAY,
  );

  it('keeps departments that hold no stock', () => {
    const { rows } = departmentMatrix(items, PHARMACY_PROFILE.departments);
    expect(rows).toHaveLength(PHARMACY_PROFILE.departments.length);

    const empty = rows.find((r) => r.department === 'Dispensary / Rx');
    expect(empty?.total).toBe(0);
    // Holding nothing is not a failure, so it must not read as ACTION NEEDED.
    expect(empty?.risk).toBe('HEALTHY');
  });

  it('flags a department holding expired stock', () => {
    const { rows } = departmentMatrix(items, PHARMACY_PROFILE.departments);
    expect(rows.find((r) => r.department === 'OTC Medications')?.risk).toBe('ACTION NEEDED');
    expect(rows.find((r) => r.department === 'Wound Care')?.risk).toBe('HEALTHY');
  });

  it('totals across every department', () => {
    const { total } = departmentMatrix(items, PHARMACY_PROFILE.departments);
    expect(total.total).toBe(3);
    expect(total.expired).toBe(1);
    expect(total.clear).toBe(2);
  });

  it('flags dormancy above the review threshold', () => {
    const dormant = evaluateStock(
      Array.from({ length: 3 }, (_, i) => ({
        ...BASE,
        sku: `D${i}`,
        department: 'Homeopathic',
        expiryDate: '2027-06-01',
        action: 'Left on Shelf' as const,
      })),
      TODAY,
    );
    const { rows } = departmentMatrix(dormant, PHARMACY_PROFILE.departments);
    expect(rows.find((r) => r.department === 'Homeopathic')?.risk).toBe('REVIEW DORMANCY');
  });
});

describe('stockReportSections', () => {
  it('orders expired stock by how long it has been overdue', () => {
    const items = evaluateStock(
      [
        { ...BASE, sku: 'RECENT', expiryDate: '2026-08-25' },
        { ...BASE, sku: 'OLD', expiryDate: '2026-01-01' },
      ],
      TODAY,
    );
    const { expired } = stockReportSections(items);
    expect(expired.map((i) => i.sku)).toEqual(['OLD', 'RECENT']);
  });
});

describe('compliance profiles', () => {
  it('reproduces the workbook exactly under the pharmacy profile', () => {
    expect(PHARMACY_PROFILE.regulator).toBe('SAHPRA');
    expect(PHARMACY_PROFILE.responsibleRoleLabel).toBe('Pharmacist on Duty');
    expect(PHARMACY_PROFILE.departments).toContain('Dispensary / Rx');
    expect(PHARMACY_PROFILE.retentionNote).toMatch(/SAHPRA/);
  });

  it('falls back to the general profile for an unknown id', () => {
    expect(complianceProfile('does-not-exist').id).toBe('general');
    // The general profile names no regulator, so nothing invents one.
    expect(complianceProfile('does-not-exist').regulator).toBeUndefined();
  });

  it('does not name a regulator in recommendations when the sector has none', () => {
    const summary = complianceSummary(
      evaluateStock([{ ...BASE, expiryDate: '2026-07-01' }], TODAY),
    );
    const text = ownerRecommendations(summary, complianceProfile('general'))
      .map((r) => r.body)
      .join(' ');
    expect(text).not.toMatch(/SAHPRA/);
    expect(text).toMatch(/insurance/);
  });
});

describe('ownerRecommendations', () => {
  it('drops recommendations that no longer apply', () => {
    const clean = complianceSummary(
      evaluateStock([{ ...BASE, expiryDate: '2027-06-01', action: 'Returned to Supplier' }], TODAY),
    );
    const headings = ownerRecommendations(clean, PHARMACY_PROFILE).map((r) => r.heading);

    // Telling an owner to escalate expired stock they do not have teaches them
    // to skim the report.
    expect(headings).not.toContain('Expired stock');
    expect(headings).not.toContain('Critical stock');
    // The standing insurance and financial notes always appear.
    expect(headings).toContain('Insurance note');
    expect(headings).toContain('Financial note');
  });

  it('raises expired stock with its counts when there is some', () => {
    const summary = complianceSummary(
      evaluateStock([{ ...BASE, qty: 12, expiryDate: '2026-07-01' }], TODAY),
    );
    const expired = ownerRecommendations(summary, PHARMACY_PROFILE).find(
      (r) => r.heading === 'Expired stock',
    );
    expect(expired?.body).toMatch(/12 units/);
    expect(expired?.body).toMatch(/insurer/);
  });
});
