/**
 * Demo workspace — Kalahari Retail Group (Pty) Ltd.
 *
 * Every figure below is transcribed from
 * Amryn_AIGrowthIntelligence_Interactive_Software_Prototype.xlsx: SETTINGS,
 * DEMO_DATA, OPPORTUNITY_DATABASE, RISK_REGISTER, ACTION_CENTRE, DECISION_LOG,
 * COMPETITOR_INTELLIGENCE and MARKET_INTELLIGENCE.
 *
 * It is illustrative demonstration data, not a real client. Every view that
 * renders it says so, as the workbook's own footer does.
 */

import type {
  Action,
  Branch,
  BusinessProfile,
  Competitor,
  Decision,
  MarketSignal,
  MonthInput,
  Opportunity,
  Risk,
} from '@/lib/intelligence/types';

export const KALAHARI_PROFILE: BusinessProfile = {
  companyName: 'Kalahari Retail Group (Pty) Ltd',
  industry: 'Retail — Food & General Merchandise',
  location: 'Kimberley, Northern Cape, South Africa',
  currency: 'ZAR',
  reportingPeriod: 'August 2026',
  fiscalYearStart: '1 January',
  branches: 4,
  employees: 87,
  founded: 2018,
  businessModel: 'B2C Multi-Branch Retail',
  strategicObjectives: [
    'Grow revenue by 20% in FY2027',
    'Expand to 2 new branches in 12 months',
    'Reduce operating costs by 10%',
  ],
  revenueTargetAnnual: 12_000_000,
  grossMarginTarget: 0.38,
  netProfitTarget: 0.12,
  customerGrowthTarget: 0.15,
};

/**
 * DEMO_DATA rows 4–15. September onwards are zero-filled in the workbook and
 * kept that way here: the year-to-date roll-up excludes them, so the shape of
 * a part-reported year is exercised rather than assumed away.
 */
export const KALAHARI_MONTHS: MonthInput[] = [
  {
    month: 'Jan 2026', revenue: 820_000, cogs: 508_400, opex: 177_000,
    cashIn: 830_000, cashOut: 695_000, accountsReceivable: 98_400, accountsPayable: 61_500,
    newCustomers: 42, totalCustomers: 1_020, returns: 18, marketingSpend: 32_800,
  },
  {
    month: 'Feb 2026', revenue: 790_000, cogs: 489_800, opex: 158_000,
    cashIn: 800_000, cashOut: 670_000, accountsReceivable: 94_800, accountsPayable: 59_250,
    newCustomers: 38, totalCustomers: 1_058, returns: 21, marketingSpend: 31_600,
  },
  {
    month: 'Mar 2026', revenue: 880_000, cogs: 545_600, opex: 176_000,
    cashIn: 895_000, cashOut: 740_000, accountsReceivable: 105_600, accountsPayable: 66_000,
    newCustomers: 51, totalCustomers: 1_109, returns: 15, marketingSpend: 35_200,
  },
  {
    month: 'Apr 2026', revenue: 910_000, cogs: 564_200, opex: 182_000,
    cashIn: 920_000, cashOut: 760_000, accountsReceivable: 109_200, accountsPayable: 68_250,
    newCustomers: 47, totalCustomers: 1_156, returns: 19, marketingSpend: 36_400,
  },
  {
    month: 'May 2026', revenue: 940_000, cogs: 582_800, opex: 188_000,
    cashIn: 950_000, cashOut: 785_000, accountsReceivable: 112_800, accountsPayable: 70_500,
    newCustomers: 55, totalCustomers: 1_211, returns: 22, marketingSpend: 37_600,
  },
  {
    month: 'Jun 2026', revenue: 870_000, cogs: 539_400, opex: 174_000,
    cashIn: 880_000, cashOut: 726_000, accountsReceivable: 104_400, accountsPayable: 65_250,
    newCustomers: 40, totalCustomers: 1_251, returns: 25, marketingSpend: 34_800,
  },
  {
    month: 'Jul 2026', revenue: 960_000, cogs: 595_200, opex: 192_000,
    cashIn: 970_000, cashOut: 798_000, accountsReceivable: 115_200, accountsPayable: 72_000,
    newCustomers: 62, totalCustomers: 1_313, returns: 17, marketingSpend: 38_400,
  },
  {
    month: 'Aug 2026', revenue: 885_000, cogs: 548_700, opex: 177_000,
    cashIn: 895_000, cashOut: 741_000, accountsReceivable: 106_200, accountsPayable: 66_375,
    newCustomers: 48, totalCustomers: 1_361, returns: 20, marketingSpend: 35_400,
  },
  ...(['Sep 2026', 'Oct 2026', 'Nov 2026', 'Dec 2026'] as const).map(
    (month): MonthInput => ({
      month, revenue: 0, cogs: 0, opex: 0, cashIn: 0, cashOut: 0,
      accountsReceivable: 0, accountsPayable: 0, newCustomers: 0,
      totalCustomers: 0, returns: 0, marketingSpend: 0,
    }),
  ),
];

/** DEMO_DATA rows 20–23. */
export const KALAHARI_BRANCHES: Branch[] = [
  { name: 'City Centre', revenueYtd: 2_850_000, grossProfit: 1_083_000, netProfit: 342_000, customers: 4_820, staff: 22, avgOrder: 591, healthScore: 78 },
  { name: 'Diamond Pavilion', revenueYtd: 2_410_000, grossProfit: 915_800, netProfit: 289_200, customers: 4_120, staff: 18, avgOrder: 585, healthScore: 71 },
  { name: 'Galeshewe', revenueYtd: 1_680_000, grossProfit: 638_400, netProfit: 201_600, customers: 2_940, staff: 14, avgOrder: 571, healthScore: 65 },
  { name: 'Sol Plaatje', revenueYtd: 1_115_000, grossProfit: 423_700, netProfit: 133_800, customers: 1_980, staff: 10, avgOrder: 563, healthScore: 58 },
];

/** OPPORTUNITY_DATABASE rows 3–8. */
export const KALAHARI_OPPORTUNITIES: Opportunity[] = [
  { id: 'OPP-001', date: '2026-07-15', title: 'Replicate Diamond Pavilion product mix at Galeshewe', category: 'Operational Improvement', source: 'Internal', estValue: 180_000, probability: 0.75, strategicFit: 0.85, urgency: 0.8, effort: 0.4, owner: 'CEO', status: 'Active' },
  { id: 'OPP-002', date: '2026-07-22', title: 'Corporate catering contract — Sol Plaatje area', category: 'New Customer', source: 'Sales Call', estValue: 96_000, probability: 0.6, strategicFit: 0.7, urgency: 0.9, effort: 0.5, owner: 'Branch Mgr', status: 'Evaluating' },
  { id: 'OPP-003', date: '2026-08-01', title: 'Private label product development — 2 SKUs', category: 'New Product', source: 'Market Research', estValue: 240_000, probability: 0.5, strategicFit: 0.8, urgency: 0.65, effort: 0.7, owner: 'CEO', status: 'Evaluating' },
  { id: 'OPP-004', date: '2026-08-05', title: 'Loyalty programme launch — increase repeat visits', category: 'Customer Growth', source: 'Customer Feedback', estValue: 150_000, probability: 0.8, strategicFit: 0.9, urgency: 0.85, effort: 0.55, owner: 'CEO', status: 'Planning' },
  { id: 'OPP-005', date: '2026-08-10', title: 'Cross-sell fresh produce at Diamond Pavilion', category: 'Cross-Sell', source: 'Internal', estValue: 72_000, probability: 0.7, strategicFit: 0.65, urgency: 0.7, effort: 0.35, owner: 'Branch Mgr', status: 'Active' },
  { id: 'OPP-006', date: '2026-08-15', title: 'Weekend market presence — Kimberley CBD', category: 'Geographic Expansion', source: 'Market Research', estValue: 48_000, probability: 0.55, strategicFit: 0.6, urgency: 0.75, effort: 0.45, owner: 'CEO', status: 'Evaluating' },
];

/** RISK_REGISTER rows 3–8. */
export const KALAHARI_RISKS: Risk[] = [
  { id: 'RSK-001', risk: 'Sol Plaatje branch underperformance', category: 'Operational', probability: 0.7, impact: 0.75, owner: 'CEO', mitigation: 'Conduct operational audit and management review', dueDate: '2026-09-15', status: 'Open', trend: 'Stable' },
  { id: 'RSK-002', risk: 'Rising COGS eroding gross margin', category: 'Financial', probability: 0.6, impact: 0.8, owner: 'CEO/Ops', mitigation: 'Review supplier pricing and renegotiate contracts', dueDate: '2026-09-30', status: 'Open', trend: 'Worsening' },
  { id: 'RSK-003', risk: 'Key staff retention at City Centre', category: 'People', probability: 0.45, impact: 0.65, owner: 'HR', mitigation: 'Implement retention incentive programme', dueDate: '2026-10-31', status: 'Monitoring', trend: 'Stable' },
  { id: 'RSK-004', risk: 'Single-supplier dependency — refrigeration', category: 'Supplier', probability: 0.35, impact: 0.85, owner: 'Operations', mitigation: 'Identify and qualify backup supplier', dueDate: '2026-09-30', status: 'Open', trend: 'Stable' },
  { id: 'RSK-005', risk: 'Competitor price reduction in Galeshewe', category: 'Competitor', probability: 0.55, impact: 0.6, owner: 'Marketing', mitigation: 'Monitor weekly; prepare promotional response plan', dueDate: '2026-09-15', status: 'Monitoring', trend: 'Worsening' },
  { id: 'RSK-006', risk: 'Cash flow tightening in December', category: 'Financial', probability: 0.65, impact: 0.7, owner: 'CEO', mitigation: 'Build cash reserve buffer; arrange credit facility', dueDate: '2026-11-30', status: 'Planning', trend: 'Stable' },
];

/** ACTION_CENTRE rows 8–15. */
export const KALAHARI_ACTIONS: Action[] = [
  { id: 'ACT-001', action: 'Sol Plaatje branch operational audit', source: 'Risk Register', priority: 'HIGH', owner: 'CEO', status: 'In Progress', dueDate: '2026-09-15', expectedResult: 'Identify 3+ improvements', completion: 0.4, notes: 'Audit framework prepared' },
  { id: 'ACT-002', action: 'Renegotiate COGS supplier pricing', source: 'Risk Register', priority: 'HIGH', owner: 'Operations', status: 'Not Started', dueDate: '2026-09-30', expectedResult: '3-5% COGS reduction', completion: 0, notes: 'Identify supplier contacts' },
  { id: 'ACT-003', action: 'Launch customer loyalty programme', source: 'Opportunity', priority: 'MEDIUM', owner: 'Marketing', status: 'Planning', dueDate: '2026-10-15', expectedResult: '5% more repeat visits', completion: 0.15, notes: 'Design phase commenced' },
  { id: 'ACT-004', action: 'Replicate Diamond Pavilion product mix', source: 'Opportunity', priority: 'HIGH', owner: 'Branch Mgr', status: 'In Progress', dueDate: '2026-09-22', expectedResult: 'R15,000+ extra monthly', completion: 0.3, notes: 'SKU list being drafted' },
  { id: 'ACT-005', action: 'Build December cash reserve buffer', source: 'Risk Register', priority: 'MEDIUM', owner: 'CEO', status: 'Not Started', dueDate: '2026-11-01', expectedResult: '3-month operating reserve', completion: 0, notes: 'Assess Sept cash position' },
  { id: 'ACT-006', action: 'Investigate competitor price reduction', source: 'Risk Register', priority: 'MEDIUM', owner: 'Marketing', status: 'In Progress', dueDate: '2026-09-05', expectedResult: 'Response plan ready', completion: 0.6, notes: 'Initial recon completed' },
  { id: 'ACT-007', action: 'Weekly branch performance review', source: 'Executive', priority: 'HIGH', owner: 'CEO', status: 'In Progress', dueDate: '2026-08-29', expectedResult: 'All 4 branches reviewed', completion: 0.5, notes: 'Scheduled for Friday' },
  { id: 'ACT-008', action: 'Activate marketing spend tracking', source: 'System', priority: 'LOW', owner: 'Admin', status: 'Not Started', dueDate: '2026-09-01', expectedResult: 'Complete intelligence loop', completion: 0, notes: 'Awaiting input template' },
];

/** DECISION_LOG rows 3–4 — the organisational memory. */
export const KALAHARI_DECISIONS: Decision[] = [
  { id: 'DEC-001', date: '2026-08-22', decision: 'Prioritise Sol Plaatje audit before Q4', reason: 'Branch health 58/100', dataUsed: 'Business Health + Branch Data', recommendation: 'Recovery plan within 30 days', decisionMaker: 'Founder/CEO', expectedOutcome: 'Health score 65+ by Oct 2026', actualOutcome: 'Pending', lessonsLearned: 'Document learnings post-audit' },
  { id: 'DEC-002', date: '2026-08-22', decision: 'Advance loyalty programme to planning', reason: 'OPP-004 scores highest, R150K value', dataUsed: 'OpportunityRadar®', recommendation: 'Launch Q4 2026 all branches', decisionMaker: 'Founder/CEO', expectedOutcome: '5% increase in repeat visits', actualOutcome: 'Pending', lessonsLearned: 'Track repeat frequency from launch' },
];

/** COMPETITOR_INTELLIGENCE rows 3–6. */
export const KALAHARI_COMPETITORS: Competitor[] = [
  { competitor: 'Pick n Pay — Kimberley', products: 'Full grocery range', pricing: 'Competitive', location: 'City Centre', threat: 'HIGH', keyStrength: 'Brand recognition', keyWeakness: 'Premium vs locals', opportunityCreated: 'Price-sensitive customers prefer us', lastUpdated: 'Aug 2026' },
  { competitor: 'Shoprite — Galeshewe', products: 'Full grocery range', pricing: 'Low-price focused', location: 'Galeshewe', threat: 'HIGH', keyStrength: 'Volume buying power', keyWeakness: 'Customer service', opportunityCreated: 'Quality + service differentiation', lastUpdated: 'Aug 2026' },
  { competitor: 'Local Corner Stores (×12)', products: 'Essential items', pricing: 'Convenience premium', location: 'All areas', threat: 'MEDIUM', keyStrength: 'Proximity', keyWeakness: 'No loyalty programmes', opportunityCreated: 'Loyalty programme will capture share', lastUpdated: 'Aug 2026' },
  { competitor: 'Fruit & Veg City', products: 'Fresh produce', pricing: 'Competitive', location: 'Diamond Pavilion', threat: 'MEDIUM', keyStrength: 'Fresh produce range', keyWeakness: 'Limited non-fresh', opportunityCreated: 'Cross-sell opportunity in produce', lastUpdated: 'Aug 2026' },
];

/** MARKET_INTELLIGENCE rows 3–7. */
export const KALAHARI_SIGNALS: MarketSignal[] = [
  { signal: 'Electricity tariff increase Q4 2026', type: 'Economic Signal', direction: 'Negative', confidence: 'High', impact: 'HIGH', implication: 'Review energy costs and pricing before Oct 2026', source: 'Eskom/NERSA', date: 'Aug 2026' },
  { signal: 'Consumer spending constrained in lower-income segments', type: 'Consumer Trend', direction: 'Negative', confidence: 'High', impact: 'HIGH', implication: 'Expand value range and bulk-buy promotions', source: 'StatsSA', date: 'Aug 2026' },
  { signal: 'Digital payment adoption accelerating in Kimberley', type: 'Technology Trend', direction: 'Positive', confidence: 'Medium', impact: 'MEDIUM', implication: 'Ensure all branches accept digital wallets', source: 'Market Research', date: 'Jul 2026' },
  { signal: 'Tourism events increasing in Northern Cape', type: 'Market Trend', direction: 'Positive', confidence: 'Medium', impact: 'MEDIUM', implication: 'Explore catering supply for event organisers', source: 'NCEDA', date: 'Aug 2026' },
  { signal: 'Shoprite supply chain delays in Galeshewe', type: 'Competitor', direction: 'Opportunity', confidence: 'Medium', impact: 'MEDIUM', implication: 'Increase stock availability messaging at Galeshewe', source: 'Field Observation', date: 'Aug 2026' },
];
