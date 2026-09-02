import {
  complianceProfile,
  complianceSummary,
  departmentMatrix,
  stockReportSections,
  ownerRecommendations,
} from '@/lib/intelligence/inventory';
import { PHARMACY_PROFILE } from '@/lib/intelligence/inventory';
import type { InventoryView } from './demo';
import type { Row } from '@/types/database';
import { evaluateStock, type StockItemInput } from '@/lib/intelligence/inventory';
import { ACTION_LABEL } from '@/lib/inventory/mapping';

/**
 * Advanced Inventory Control, before a stocktake has been recorded.
 *
 * Still reachable, and still the right answer for an organisation that has not
 * imported one. What it is no longer is the only answer: migration 18 gave the
 * module a table, and `inventoryFromAudit` below builds the real view.
 *
 * The compliance profile is kept because it is a definition rather than data —
 * which departments exist and what the thresholds are — so the empty screen
 * still shows the right columns.
 */
export function emptyInventory(asOf: Date): InventoryView {
  const profile = complianceProfile(PHARMACY_PROFILE.id);
  const items: never[] = [];
  const summary = complianceSummary(items);

  return {
    recorded: false,
    settings: {
      siteName: '',
      auditorName: '',
      responsibleName: '',
      shift: profile.shifts[0] ?? '',
      complianceProfileId: profile.id,
    },
    profile,
    auditDate: asOf.toISOString().slice(0, 10),
    items,
    summary,
    departments: departmentMatrix(items, profile.departments),
    sections: stockReportSections(items),
    recommendations: ownerRecommendations(summary, profile),
  };
}

/**
 * One recorded stocktake, in the shape every inventory screen already renders.
 *
 * The engine is untouched: `evaluateStock` computes expiry status, dormancy
 * and value at risk from the columns, exactly as it did for the demonstration
 * dataset. Nothing derived is stored, so a figure on the report cannot
 * disagree with its own formula.
 */
export function inventoryFromAudit(
  audit: Row<'stock_audits'>,
  rows: readonly Row<'stock_items'>[],
  asOf: Date,
): InventoryView {
  const profile = complianceProfile(audit.compliance_profile_id);

  const input: StockItemInput[] = rows.map((row) => ({
    productName: row.product_name,
    sku: row.sku,
    batchNumber: row.batch_number,
    department: row.department,
    location: row.location,
    qty: row.qty,
    expiryDate: row.expiry_date,
    action: ACTION_LABEL[row.action],
    actionedBy: row.actioned_by,
    dateActioned: row.actioned_on ?? '',
    notes: row.notes,
    verified: row.verified,
    // Undefined rather than zero where no cost is recorded, so the report
    // states "not costed" instead of reporting nothing at risk.
    unitCost: row.unit_cost_cents === null ? undefined : row.unit_cost_cents / 100,
    hasMovement: row.has_movement ?? undefined,
  }));

  const items = evaluateStock(input, asOf);
  const summary = complianceSummary(items);

  return {
    recorded: true,
    settings: {
      siteName: audit.site_name,
      auditorName: audit.auditor_name,
      responsibleName: audit.responsible_name,
      shift: audit.shift,
      complianceProfileId: profile.id,
    },
    profile,
    auditDate: audit.audit_date,
    items,
    summary,
    departments: departmentMatrix(items, profile.departments),
    sections: stockReportSections(items),
    recommendations: ownerRecommendations(summary, profile),
  };
}
