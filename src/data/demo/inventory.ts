/**
 * Demo audit — Advanced Inventory Control.
 *
 * The ten lines are the AUDIT LOG of
 * Amryn_AIGrowthIntelligence__Advanced_Inventory_Control.xlsx: the same
 * products, SKUs, batches, departments, locations, quantities, actions,
 * auditors and notes.
 *
 * The expiry **dates** are the one thing not copied literally. The workbook
 * carries fixed dates and computes status against `TODAY()`, which means every
 * line drifts to EXPIRED as the file ages — a demo that decays into a wall of
 * red teaches nothing about the module. Each line therefore carries the offset
 * in days that reproduces the workbook's status on its own audit date, and the
 * date is derived from whenever the page is viewed. The status distribution the
 * workbook demonstrates (1 expired, 3 critical, 1 warning, 5 clear) holds
 * permanently, and the status rules are exercised, not bypassed.
 */

import type { StockItemInput } from '@/lib/intelligence/inventory';
import { PHARMACY_PROFILE } from '@/lib/intelligence/inventory';

export interface DemoAuditSettings {
  /** SETTINGS!B4 */
  siteName: string;
  /** SETTINGS!B5 */
  auditorName: string;
  /** SETTINGS!B6 */
  responsibleName: string;
  /** SETTINGS!B7 */
  shift: string;
  complianceProfileId: string;
}

export const KIMKEM_AUDIT_SETTINGS: DemoAuditSettings = {
  siteName: 'Kimkem Pharmacy Kimberley',
  auditorName: 'Staff Member',
  responsibleName: 'Peter Du Toit',
  shift: PHARMACY_PROFILE.shifts[0] ?? 'Full Day Audit',
  complianceProfileId: PHARMACY_PROFILE.id,
};

interface DemoLine extends Omit<StockItemInput, 'expiryDate' | 'dateActioned'> {
  /** Days from the viewing date to expiry. Negative is already expired. */
  expiresInDays: number;
  /** Days before the viewing date that the action was recorded. */
  actionedDaysAgo: number | null;
}

const LINES: DemoLine[] = [
  {
    productName: 'Panado Tablets 500mg ×24', sku: 'PAN-500-24', batchNumber: 'B2024-0891',
    department: 'OTC Medications', location: 'A3-02', qty: 12,
    expiresInDays: -38, action: 'Removed from Shelf', actionedBy: 'J. Dlamini',
    actionedDaysAgo: 10, notes: 'Pulled — past expiry', verified: true, unitCost: 42.5,
  },
  {
    productName: 'Vitamin C 1000mg Effervescent', sku: 'VC-1000-EF', batchNumber: 'VC-4401',
    department: 'Vitamins & Supplements', location: 'B1-07', qty: 6,
    expiresInDays: 251, action: 'Left on Shelf', actionedBy: 'J. Dlamini',
    actionedDaysAgo: 10, notes: '', verified: true, unitCost: 89.0,
  },
  {
    productName: 'Nurofen Express 400mg ×16', sku: 'NUR-EXP-16', batchNumber: 'NE-2026B',
    department: 'OTC Medications', location: 'A3-05', qty: 3,
    expiresInDays: 19, action: 'Marked Down / Clearance', actionedBy: 'J. Dlamini',
    actionedDaysAgo: 10, notes: '30% markdown applied', verified: true, unitCost: 76.0,
  },
  {
    productName: 'NAN Pro 1 Infant Formula 900g', sku: 'NAN-PRO1-900', batchNumber: 'NP-0826',
    department: 'Baby & Maternal', location: 'C2-01', qty: 2,
    expiresInDays: 14, action: 'Pending Review', actionedBy: '',
    actionedDaysAgo: null, notes: '', verified: false, unitCost: 329.0,
  },
  {
    productName: 'Hydrocortisone 1% Cream 30g', sku: 'HC-1PCT-30G', batchNumber: 'HC-B445',
    department: 'Wound Care', location: 'D1-03', qty: 8,
    expiresInDays: 59, action: 'Left on Shelf', actionedBy: 'J. Dlamini',
    actionedDaysAgo: 10, notes: '', verified: true, unitCost: 58.5,
  },
  {
    productName: 'Metformin 500mg Tablets ×30', sku: 'MET-500-30', batchNumber: 'MF-2026A',
    department: 'Chronic & Diabetic', location: 'E2-01', qty: 5,
    expiresInDays: 146, action: 'Left on Shelf', actionedBy: 'J. Dlamini',
    actionedDaysAgo: 10, notes: '', verified: true, unitCost: 64.0,
  },
  {
    productName: 'Rescue Remedy Drops 10ml', sku: 'RR-DROPS-10', batchNumber: 'RR-B220',
    department: 'Homeopathic', location: 'F1-04', qty: 4,
    expiresInDays: 6, action: 'Pending Review', actionedBy: '',
    actionedDaysAgo: null, notes: 'Check with pharmacist', verified: false, unitCost: 145.0,
  },
  {
    productName: 'Epimax Oat Cream 500ml', sku: 'EPI-OAT-500', batchNumber: 'EP-0926',
    department: 'Beauty & Skincare', location: 'G3-02', qty: 11,
    expiresInDays: 312, action: 'Left on Shelf', actionedBy: 'J. Dlamini',
    actionedDaysAgo: 10, notes: '', verified: true, unitCost: 112.0,
  },
  {
    productName: 'Allergex Syrup 100ml', sku: 'ALL-SYR-100', batchNumber: 'AS-2026C',
    department: 'OTC Medications', location: 'A4-01', qty: 7,
    expiresInDays: 131, action: 'Left on Shelf', actionedBy: 'S. Mokoena',
    actionedDaysAgo: 10, notes: '', verified: true, unitCost: 51.0,
  },
  {
    productName: 'Bio-Oil Specialist Oil 125ml', sku: 'BIO-OIL-125', batchNumber: 'BO-0126',
    department: 'Beauty & Skincare', location: 'G2-05', qty: 9,
    expiresInDays: 358, action: 'Left on Shelf', actionedBy: 'S. Mokoena',
    actionedDaysAgo: 10, notes: '', verified: true, unitCost: 189.0,
  },
];

function shift(from: Date, days: number): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The demo audit log, dated relative to `today`. */
export function demoStockItems(today: Date): StockItemInput[] {
  return LINES.map(({ expiresInDays, actionedDaysAgo, ...line }) => ({
    ...line,
    expiryDate: shift(today, expiresInDays),
    dateActioned: actionedDaysAgo === null ? '' : shift(today, -actionedDaysAgo),
  }));
}

/** The date the demo audit was walked — ten days before viewing. */
export function demoAuditDate(today: Date): string {
  return shift(today, -10);
}
