/**
 * Advanced Inventory Control — the engine behind the compliance dashboard,
 * audit log, department matrix and stock intelligence report.
 *
 * Transcribed from Amryn_AIGrowthIntelligence__Advanced_Inventory_Control.xlsx.
 *
 * The workbook is written for a pharmacy throughout: it says "Pharmacist on
 * Duty", it cites SAHPRA retention periods, and its departments are Dispensary,
 * OTC and the rest. The module here is **not** pharmacy-specific. Every one of
 * those decisions is lifted into a `ComplianceProfile` — the regulator, the
 * sign-off roles, the retention wording, the department list, the disposal
 * language — so the same engine serves a food producer, a cosmetics
 * distributor, a veterinary practice or a chemical supplier. The pharmacy
 * profile is one profile among several, and it reproduces the workbook exactly.
 *
 * The status rules themselves are universal and never move: expiry dating is
 * expiry dating, whatever is on the shelf.
 */

// ─── Status rules (workbook: AUDIT LOG!I — the nested IF) ───────────────────

export type ExpiryStatus = 'EXPIRED' | 'CRITICAL' | 'WARNING' | 'CLEAR';

/**
 * The two thresholds every view in the workbook keys off, in days.
 * CRITICAL ≤30d, WARNING ≤90d, CLEAR >90d, and anything past its date EXPIRED.
 */
export const EXPIRY_THRESHOLDS = { critical: 30, warning: 90 } as const;

/** Whole days from `today` to `expiry`. Negative once the date has passed. */
export function daysLeft(expiry: Date, today: Date): number {
  const startOfDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((startOfDay(expiry) - startOfDay(today)) / 86_400_000);
}

/**
 * AUDIT LOG!I: `IF(days < 0, EXPIRED, IF(days <= 30, CRITICAL,
 * IF(days <= 90, WARNING, CLEAR)))`.
 *
 * Note the boundary the workbook chose: zero days left — expiring today — is
 * CRITICAL, not EXPIRED. Stock is saleable until the date passes.
 */
export function expiryStatus(days: number): ExpiryStatus {
  if (days < 0) return 'EXPIRED';
  if (days <= EXPIRY_THRESHOLDS.critical) return 'CRITICAL';
  if (days <= EXPIRY_THRESHOLDS.warning) return 'WARNING';
  return 'CLEAR';
}

/** DASHBOARD!D25:D28 — what each status obliges someone to do. */
export const STATUS_GUIDANCE: Readonly<Record<ExpiryStatus, string>> = {
  EXPIRED: 'Remove from shelf immediately. Log removal and notify the responsible manager.',
  CRITICAL: 'High priority. Initiate return-to-supplier or markdown procedure.',
  WARNING: 'Begin planning action. Monitor and update at each audit cycle.',
  CLEAR: 'No action required. Continue regular audit checks.',
};

export const STATUS_LABEL: Readonly<Record<ExpiryStatus, string>> = {
  EXPIRED: 'EXPIRED',
  CRITICAL: `CRITICAL ≤${EXPIRY_THRESHOLDS.critical}d`,
  WARNING: `WARNING ≤${EXPIRY_THRESHOLDS.warning}d`,
  CLEAR: `CLEAR >${EXPIRY_THRESHOLDS.warning}d`,
};

// ─── Actions (workbook: SETTINGS!B10:B15 — the ACTION LIST) ─────────────────

export const STOCK_ACTIONS = [
  'Pending Review',
  'Left on Shelf',
  'Removed from Shelf',
  'Returned to Supplier',
  'Marked Down / Clearance',
  'Destroyed / Disposed',
] as const;

export type StockAction = (typeof STOCK_ACTIONS)[number];

// ─── Dormancy (workbook: STOCK REPORT!B17:C20) ──────────────────────────────

export type DormancyClass = 'WRITE-OFF' | 'AT-RISK' | 'SLOW-MOVING' | 'DORMANT' | 'ACTIVE';

export const DORMANCY_DEFINITIONS: Readonly<Record<DormancyClass, string>> = {
  'WRITE-OFF':
    'Status EXPIRED. Remove from sale immediately. Document batch and quantity for insurance and disposal records.',
  'AT-RISK':
    'Status CRITICAL (≤30d) · Still on shelf. Immediate action required — return to supplier or authorised disposal.',
  'SLOW-MOVING':
    'Status WARNING (31–90d) · Left on Shelf. Consider markdown, promotion or supplier return before the window closes.',
  DORMANT:
    'Left on Shelf · Status CLEAR (>90d) · No recorded sales. Capital is tied up. Review purchasing patterns.',
  ACTIVE: 'Actioned, or moving normally. No dormancy concern.',
};

/**
 * STOCK REPORT sections A–C.
 *
 * The workbook's dormancy test is `action = "Left on Shelf" AND status =
 * "CLEAR"` — it infers "no recorded sales" from an item having been looked at,
 * left alone, and not being near expiry. That inference is the workbook's, and
 * it is preserved; what it cannot see is actual turnover. Where a real sales
 * feed exists, pass `hasMovement` and an item that is genuinely selling stops
 * being reported as dormant.
 */
export function dormancyClass(
  status: ExpiryStatus,
  action: StockAction | '',
  hasMovement?: boolean,
): DormancyClass {
  if (status === 'EXPIRED') return 'WRITE-OFF';
  if (status === 'CRITICAL' && action === 'Left on Shelf') return 'AT-RISK';
  if (status === 'WARNING' && action === 'Left on Shelf') return 'SLOW-MOVING';
  if (status === 'CLEAR' && action === 'Left on Shelf' && hasMovement !== true) {
    return 'DORMANT';
  }
  return 'ACTIVE';
}

// ─── Records ────────────────────────────────────────────────────────────────

/** One row of the AUDIT LOG, before the sheet's computed columns. */
export interface StockItemInput {
  productName: string;
  sku: string;
  batchNumber: string;
  department: string;
  location: string;
  qty: number;
  /** ISO date (YYYY-MM-DD). */
  expiryDate: string;
  action: StockAction | '';
  actionedBy: string;
  dateActioned: string;
  notes: string;
  /** AUDIT LOG!O — the auditor's tick that this line has been dealt with. */
  verified: boolean;
  /** Unit cost, where known. Lets the report state capital at risk in money. */
  unitCost?: number;
  /** True where a sales feed shows the item moving. Overrides the dormancy inference. */
  hasMovement?: boolean;
}

export interface StockItem extends StockItemInput {
  index: number;
  daysLeft: number;
  status: ExpiryStatus;
  dormancy: DormancyClass;
  /** qty × unitCost, where a cost is known. */
  valueAtRisk: number;
}

export function evaluateStock(items: StockItemInput[], today: Date): StockItem[] {
  return items.map((item, i) => {
    const days = daysLeft(new Date(`${item.expiryDate}T00:00:00Z`), today);
    const status = expiryStatus(days);
    return {
      ...item,
      index: i + 1,
      daysLeft: days,
      status,
      dormancy: dormancyClass(status, item.action, item.hasMovement),
      valueAtRisk: item.unitCost === undefined ? 0 : item.qty * item.unitCost,
    };
  });
}

// ─── Compliance dashboard (workbook: DASHBOARD) ─────────────────────────────

export interface ComplianceSummary {
  totalItems: number;
  expired: number;
  critical: number;
  warning: number;
  clear: number;
  /** DASHBOARD!B10 = CLEAR ÷ total. */
  complianceRate: number;
  /** DASHBOARD!D10 */
  pendingReview: number;
  /** DASHBOARD!F10 = EXPIRED + CRITICAL. */
  urgent: number;
  /** STOCK REPORT!D12 — units, not lines. */
  expiredQty: number;
  /** STOCK REPORT!F12 */
  dormantQty: number;
  dormantItems: number;
  /** Money tied up in expired and critical stock, where costs are known. */
  valueAtRisk: number;
  /** DASHBOARD!B16:F21 — the action breakdown. */
  actionBreakdown: Array<{ action: StockAction; count: number }>;
}

export function complianceSummary(items: StockItem[]): ComplianceSummary {
  const countStatus = (s: ExpiryStatus) => items.filter((i) => i.status === s).length;
  const expired = countStatus('EXPIRED');
  const critical = countStatus('CRITICAL');
  const clear = countStatus('CLEAR');
  const dormant = items.filter((i) => i.dormancy === 'DORMANT');

  return {
    totalItems: items.length,
    expired,
    critical,
    warning: countStatus('WARNING'),
    clear,
    complianceRate: items.length === 0 ? 0 : clear / items.length,
    pendingReview: items.filter((i) => i.action === 'Pending Review').length,
    urgent: expired + critical,
    expiredQty: items
      .filter((i) => i.status === 'EXPIRED')
      .reduce((total, i) => total + i.qty, 0),
    dormantQty: dormant.reduce((total, i) => total + i.qty, 0),
    dormantItems: dormant.length,
    valueAtRisk: items
      .filter((i) => i.status === 'EXPIRED' || i.status === 'CRITICAL')
      .reduce((total, i) => total + i.valueAtRisk, 0),
    actionBreakdown: STOCK_ACTIONS.map((action) => ({
      action,
      count: items.filter((i) => i.action === action).length,
    })),
  };
}

// ─── Department matrix (workbook: DEPT SUMMARY, STOCK REPORT section D) ─────

export type DepartmentRisk = 'ACTION NEEDED' | 'REVIEW DORMANCY' | 'HEALTHY';

/** STOCK REPORT!J9039 — the dormancy count above which a department is flagged. */
export const DORMANCY_REVIEW_THRESHOLD = 2;

export interface DepartmentRow {
  department: string;
  total: number;
  expired: number;
  critical: number;
  warning: number;
  clear: number;
  complianceRate: number;
  dormantItems: number;
  risk: DepartmentRisk;
}

/**
 * The matrix, one row per configured department plus a total.
 *
 * Departments with no stock are kept rather than dropped: on a compliance
 * record, "we hold nothing here" and "we did not look here" must not render
 * identically. Their compliance rate is 0/0, which the workbook's IFERROR
 * reports as 0% — shown as "—" in the UI, since a department holding nothing is
 * not failing.
 */
export function departmentMatrix(
  items: StockItem[],
  departments: readonly string[],
): { rows: DepartmentRow[]; total: DepartmentRow } {
  const rowFor = (department: string, scope: StockItem[]): DepartmentRow => {
    const countStatus = (s: ExpiryStatus) => scope.filter((i) => i.status === s).length;
    const expired = countStatus('EXPIRED');
    const critical = countStatus('CRITICAL');
    const clear = countStatus('CLEAR');
    const dormantItems = scope.filter((i) => i.dormancy === 'DORMANT').length;

    return {
      department,
      total: scope.length,
      expired,
      critical,
      warning: countStatus('WARNING'),
      clear,
      complianceRate: scope.length === 0 ? 0 : clear / scope.length,
      dormantItems,
      risk:
        expired + critical > 0
          ? 'ACTION NEEDED'
          : dormantItems > DORMANCY_REVIEW_THRESHOLD
            ? 'REVIEW DORMANCY'
            : 'HEALTHY',
    };
  };

  return {
    rows: departments.map((d) => rowFor(d, items.filter((i) => i.department === d))),
    total: rowFor('TOTAL', items),
  };
}

// ─── Stock intelligence report (workbook: STOCK REPORT sections A–C) ────────

export interface StockReportSections {
  /** Section A — expired stock register, for insurance and disposal. */
  expired: StockItem[];
  /** Section B — critical stock, ≤30 days, immediate action required. */
  critical: StockItem[];
  /** Section C — dormant and slow-moving stock, for owner and financial review. */
  dormant: StockItem[];
}

export function stockReportSections(items: StockItem[]): StockReportSections {
  return {
    expired: items
      .filter((i) => i.status === 'EXPIRED')
      .sort((a, b) => a.daysLeft - b.daysLeft),
    critical: items
      .filter((i) => i.status === 'CRITICAL')
      .sort((a, b) => a.daysLeft - b.daysLeft),
    dormant: items
      .filter((i) => i.dormancy === 'DORMANT' || i.dormancy === 'SLOW-MOVING')
      .sort((a, b) => b.qty - a.qty),
  };
}

// ─── Compliance profiles ────────────────────────────────────────────────────

/**
 * Everything about the module that is sector-specific, in one place.
 *
 * The engine above never names a regulator, a department or a job title. This
 * is what makes the same Advanced Inventory Control serve a pharmacy under
 * SAHPRA and a food producer under R638 without a second codebase.
 */
export interface ComplianceProfile {
  id: string;
  label: string;
  /** What the sector calls the thing on the shelf. */
  unitNoun: string;
  /** Who signs the audit off — "Pharmacist on Duty", "Quality Manager". */
  responsibleRoleLabel: string;
  /** The person who walks the shelves. */
  auditorRoleLabel: string;
  /** Named where the sector has a regulator; omitted where it does not. */
  regulator?: string;
  /** The retention line printed on the dashboard and the report footer. */
  retentionNote: string;
  /** How disposal must be evidenced in this sector. */
  disposalNote: string;
  departments: readonly string[];
  shifts: readonly string[];
}

/** The workbook's own configuration, reproduced exactly. */
export const PHARMACY_PROFILE: ComplianceProfile = {
  id: 'pharmacy-sahpra',
  // The label names the sector only. The regulator is its own field, so a
  // caller composing "<label> · <regulator> aligned" does not say SAHPRA twice.
  label: 'Pharmacy',
  unitNoun: 'product',
  responsibleRoleLabel: 'Pharmacist on Duty',
  auditorRoleLabel: 'Auditor',
  regulator: 'SAHPRA',
  retentionNote: 'Retain audit records ≥ 5 years per SAHPRA and insurance requirements.',
  disposalNote:
    'Expired medicines must be quarantined, recorded by batch and quantity, and destroyed through an authorised waste contractor with a disposal certificate retained.',
  departments: [
    'Dispensary / Rx',
    'OTC Medications',
    'Vitamins & Supplements',
    'Baby & Maternal',
    'Beauty & Skincare',
    'Wound Care',
    'Chronic & Diabetic',
    'Homeopathic',
    'Food & Nutrition',
  ],
  shifts: [
    'Morning (07:00–15:00)',
    'Afternoon (15:00–21:00)',
    'Night (21:00–07:00)',
    'Full Day Audit',
  ],
};

export const FOOD_RETAIL_PROFILE: ComplianceProfile = {
  id: 'food-retail',
  label: 'Food & general retail',
  unitNoun: 'line',
  responsibleRoleLabel: 'Store Manager on Duty',
  auditorRoleLabel: 'Auditor',
  regulator: 'Department of Health (R638)',
  retentionNote: 'Retain audit records ≥ 2 years for environmental health inspection.',
  disposalNote:
    'Expired food stock must be removed from sale, recorded by batch and quantity, and disposed of through a registered waste handler.',
  departments: [
    'Fresh Produce',
    'Butchery',
    'Bakery',
    'Dairy & Chilled',
    'Frozen',
    'Ambient Grocery',
    'Household & Cleaning',
    'Health & Beauty',
  ],
  shifts: ['Morning (07:00–15:00)', 'Afternoon (15:00–21:00)', 'Full Day Audit'],
};

export const GENERAL_INVENTORY_PROFILE: ComplianceProfile = {
  id: 'general',
  label: 'General inventory',
  unitNoun: 'item',
  responsibleRoleLabel: 'Manager on Duty',
  auditorRoleLabel: 'Auditor',
  retentionNote: 'Retain audit records in line with your insurer and auditor requirements.',
  disposalNote:
    'Expired stock must be removed from sale and its disposal recorded by batch and quantity.',
  departments: [
    'Department A',
    'Department B',
    'Department C',
    'Department D',
    'Uncategorised',
  ],
  shifts: ['Morning', 'Afternoon', 'Full Day Audit'],
};

export const COMPLIANCE_PROFILES: readonly ComplianceProfile[] = [
  PHARMACY_PROFILE,
  FOOD_RETAIL_PROFILE,
  GENERAL_INVENTORY_PROFILE,
];

export function complianceProfile(id: string): ComplianceProfile {
  return COMPLIANCE_PROFILES.find((p) => p.id === id) ?? GENERAL_INVENTORY_PROFILE;
}

// ─── Owner recommendations (workbook: STOCK REPORT section E) ───────────────

export interface OwnerRecommendation {
  heading: string;
  body: string;
}

/**
 * Section E, rewritten to be driven by the profile and the actual counts.
 *
 * The workbook's wording is preserved — the insurance and financial notes in
 * particular are the reason the report exists — but the recommendations that no
 * longer apply are dropped rather than printed against a zero. A report that
 * tells an owner to escalate expired stock when there is none teaches them to
 * skim it.
 */
export function ownerRecommendations(
  summary: ComplianceSummary,
  profile: ComplianceProfile,
): OwnerRecommendation[] {
  const out: OwnerRecommendation[] = [];
  const regulator = profile.regulator ? `${profile.regulator} and insurance` : 'insurance';

  if (summary.expired > 0) {
    out.push({
      heading: 'Expired stock',
      body:
        `All ${summary.expired} expired ${profile.unitNoun}${summary.expired === 1 ? '' : 's'} ` +
        `(${summary.expiredQty} units) must be immediately removed from sale, documented and ` +
        `presented to the insurer with batch numbers and disposal records. ${profile.disposalNote} ` +
        'Retain this report as formal evidence of compliance.',
    });
  }

  if (summary.critical > 0) {
    out.push({
      heading: 'Critical stock',
      body:
        `${summary.critical} ${profile.unitNoun}${summary.critical === 1 ? '' : 's'} within ` +
        `${EXPIRY_THRESHOLDS.critical} days of expiry should be escalated to the ` +
        `${profile.responsibleRoleLabel} for return-to-supplier or approved markdown. ` +
        'Unsold critical stock converts to a write-off liability.',
    });
  }

  if (summary.dormantItems > 0) {
    out.push({
      heading: 'Dormant stock',
      body:
        `${summary.dormantItems} ${profile.unitNoun}${summary.dormantItems === 1 ? '' : 's'} ` +
        `(${summary.dormantQty} units) are classified as dormant — left on shelf, CLEAR status, ` +
        'no recorded turnover. This represents tied-up capital. Review purchasing frequency, ' +
        'reorder quantities and supplier return policies.',
    });
  }

  if (summary.pendingReview > 0) {
    out.push({
      heading: 'Pending review',
      body:
        `${summary.pendingReview} ${profile.unitNoun}${summary.pendingReview === 1 ? '' : 's'} ` +
        'carry no recorded action. An audit line without an action is not a completed audit — ' +
        `close these before the ${profile.responsibleRoleLabel} signs off.`,
    });
  }

  out.push(
    {
      heading: 'Insurance note',
      body:
        `This report serves as a formal stock audit record for ${regulator} purposes. Expired and ` +
        'critical stock values must be disclosed to the insurer. Dormant stock inflates stated ' +
        'inventory value and should be reviewed against actual realisable value.',
    },
    {
      heading: 'Financial note',
      body:
        'Dormant and near-expiry stock should be excluded or discounted when calculating current ' +
        `inventory value for balance sheet purposes. Only CLEAR stock (>${EXPIRY_THRESHOLDS.warning} ` +
        'days remaining) should be reported at full cost value.',
    },
    {
      heading: 'Recommended action',
      body:
        'Review this report with your accountant, insurance broker and Amryn™ intelligence analyst ' +
        'on a quarterly basis. Adjust reorder thresholds based on the dormancy patterns identified ' +
        `above. ${profile.retentionNote}`,
    },
  );

  return out;
}
