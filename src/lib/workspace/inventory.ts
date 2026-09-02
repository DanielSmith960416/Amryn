import {
  complianceProfile,
  complianceSummary,
  departmentMatrix,
  stockReportSections,
  ownerRecommendations,
} from '@/lib/intelligence/inventory';
import { PHARMACY_PROFILE } from '@/lib/intelligence/inventory';
import type { InventoryView } from './demo';

/**
 * Advanced Inventory Control, with nothing in it.
 *
 * There is no stock table. The inventory module was built against the second
 * Excel prototype and reads a fixed dataset; nothing in the schema stores a
 * stock line, an expiry date or an audit, so for a real organisation there is
 * nothing to read.
 *
 * This is stated rather than hidden. The alternative was to keep handing every
 * customer the demonstration pharmacy's stock — which is what the product did,
 * and which is worse than an empty screen saying the module is not connected:
 * an empty screen is a fact, and somebody else's expiry dates are a lie that
 * looks like a feature.
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
