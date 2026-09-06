/**
 * Gap identifiers as a person would say them.
 *
 * The analysis records gaps by field name — biggestCustomerShare — because
 * that is what identifies them to the code that fills them. Putting that on a
 * screen would be showing somebody our variable names and calling it an
 * explanation.
 *
 * Only mapped names are shown. An unmapped gap is silently omitted rather than
 * rendered raw: a new gap identifier appearing in the interface as camelCase
 * is worse than it not appearing at all, and this list is the thing that has
 * to be updated when one is added.
 */
export const FIELD_LABELS: Record<string, string> = {
  annualRevenue: 'last year’s revenue',
  biggestCustomerShare: 'the share of revenue from your largest customer',
  grossMarginTarget: 'your gross margin',
  monthlyFixedCosts: 'your monthly fixed costs',
  revenueTargetAnnual: 'your revenue target for this year',
  customerCount: 'roughly how many customers you have',
  averageOrderValue: 'your typical order value',
};
