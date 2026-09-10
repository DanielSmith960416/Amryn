/**
 * Every system Amryn can connect to, declared in one place.
 *
 * The brief that asked for this put it plainly: do not scatter connector
 * availability throughout the application. So this file is the only place that
 * knows a connector exists, what it is called, which plan carries it and how
 * far along it is. A page that lists integrations reads it. The quota check
 * reads it. The sync engine will read it. Nothing hardcodes a provider name.
 *
 * No `server-only` marker and no imports beyond types: this is a declaration,
 * and both a unit test and the Integrations page need to read it.
 *
 * ── the verification state is the important field ────────────────────────
 *
 * Amryn's governing rule is that the model may never fill a numeric gap from
 * memory. That rule does not stop applying because the subject is an API
 * rather than a customer's revenue. Whether Yoco exposes a refunds endpoint,
 * whether PayFast supports OAuth, which of the several Sage products speaks
 * which protocol — these are facts about the world, and this file was written
 * without being able to reach the documentation that settles them.
 *
 * So every connector carries `verification`. `unconfirmed` means the row
 * records *what Amryn intends to read*, taken from the commercial brief, and
 * not a claim about what the provider offers. `confirmed` means somebody
 * opened the provider's own documentation, and `capabilitiesSource` says
 * where.
 *
 * The two are kept apart by more than a comment: `status` may not reach
 * 'available' while `verification` is 'unconfirmed', and there is a test that
 * fails if it does. An unconfirmed connector can be listed, planned and sold
 * against — it cannot be switched on.
 *
 * ── the intended reads are intent, not inventory ─────────────────────────
 *
 * `intendedReads` is named that way on purpose. It is the answer to "what do
 * we want out of this system", which is a product decision we are entitled to
 * make, rather than "what does this system offer", which is not ours to
 * assert. When a connector is confirmed, the list is corrected against the
 * provider's documentation and the name stops mattering.
 */
import type { Entitlement, Plan } from '@/lib/billing/access';

/**
 * Categories, aligned to the data_source_category enum the database has
 * carried since migration 01 rather than a new vocabulary beside it.
 *
 * 'payments' is the one addition: the existing enum has accounting, crm, pos,
 * erp, spreadsheet, database, api and manual, and a payment gateway is none of
 * those. It is mapped to 'api' when a connection row is written, so nothing in
 * the database has to change for this to exist.
 */
export type ConnectorCategory =
  | 'accounting'
  | 'payments'
  | 'crm'
  | 'erp'
  | 'productivity'
  | 'analytics'
  | 'commerce';

/**
 * Where a connector matters.
 *
 * South African systems are ranked above global ones of the same category
 * because the market Amryn sells into runs on Sage and takes card payments
 * through Yoco, and a connector catalogue ordered by international popularity
 * would put both below systems no local SME has heard of.
 */
export type ConnectorMarket = 'south_africa' | 'global';

/** How soon it is worth building, independent of how hard it is. */
export type ConnectorPriority = 'critical' | 'high' | 'standard' | 'prepared';

/** How a connection is authorised. 'unknown' until somebody has read the docs. */
export type ConnectorAuth = 'oauth2' | 'api_key' | 'oauth2_or_api_key' | 'unknown';

/**
 * How far along it is.
 *
 * 'investigating' is a real state and not a placeholder: it means the
 * provider's capabilities have not been established, which for several South
 * African gateways is the honest answer today.
 */
export type ConnectorStatus = 'available' | 'building' | 'planned' | 'investigating';

/** Whether the capability claims below have been checked against the provider. */
export type ConnectorVerification = 'confirmed' | 'unconfirmed';

export interface ConnectorDefinition {
  /** Stable identifier. Written to data_connections and never renamed. */
  id: string;
  name: string;
  /** One line, in the customer's language, for the Integrations card. */
  description: string;
  category: ConnectorCategory;
  market: ConnectorMarket;
  priority: ConnectorPriority;
  auth: ConnectorAuth;
  /** Whether the provider is reachable through Nango rather than by hand. */
  viaNango: boolean;
  supportsSync: boolean;
  supportsWebhooks: boolean;
  /** What Amryn wants from this system. Intent, not an inventory — see above. */
  intendedReads: readonly string[];
  /** Amryn reads. Anything it would write back is declared here and is empty today. */
  intendedWrites: readonly string[];
  /** The cheapest plan that carries it. */
  minimumPlan: Plan;
  /** An additional feature gate, where one tier's name is not the whole rule. */
  entitlement: Entitlement | null;
  status: ConnectorStatus;
  verification: ConnectorVerification;
  /** Where the capabilities were checked. Null while unconfirmed. */
  capabilitiesSource: string | null;
}

/**
 * The catalogue.
 *
 * Ordered by priority then market, which is the order the Integrations page
 * shows them in, which is the order a South African SME should meet them.
 */
export const CONNECTORS: readonly ConnectorDefinition[] = [
  // ── South African core ─────────────────────────────────────────────────
  {
    id: 'sage',
    name: 'Sage',
    description: 'Your accounts — customers, suppliers, invoices, payments and the ledger.',
    category: 'accounting',
    market: 'south_africa',
    priority: 'critical',
    auth: 'unknown',
    viaNango: false,
    supportsSync: true,
    supportsWebhooks: false,
    intendedReads: [
      'customers',
      'suppliers',
      'invoices',
      'payments',
      'expenses',
      'purchases',
      'products',
      'inventory',
      'accounts',
      'reports',
    ],
    intendedWrites: [],
    minimumPlan: 'growth',
    entitlement: null,
    status: 'investigating',
    verification: 'unconfirmed',
    capabilitiesSource: null,
  },
  {
    id: 'xero',
    name: 'Xero',
    description: 'Your accounts — invoices, bills, bank transactions and the reports drawn from them.',
    category: 'accounting',
    market: 'global',
    priority: 'critical',
    auth: 'oauth2',
    viaNango: true,
    supportsSync: true,
    supportsWebhooks: true,
    intendedReads: [
      'accounts',
      'contacts',
      'invoices',
      'bills',
      'payments',
      'expenses',
      'bank_transactions',
      'purchase_orders',
      'items',
      'reports',
    ],
    intendedWrites: [],
    minimumPlan: 'growth',
    entitlement: null,
    status: 'planned',
    verification: 'unconfirmed',
    capabilitiesSource: null,
  },
  {
    id: 'paystack',
    name: 'Paystack',
    description: 'Money taken through Paystack — transactions, refunds, fees and payouts.',
    category: 'payments',
    market: 'south_africa',
    priority: 'high',
    auth: 'api_key',
    viaNango: true,
    supportsSync: true,
    supportsWebhooks: true,
    intendedReads: ['transactions', 'customers', 'refunds', 'fees', 'payouts', 'failed_payments'],
    intendedWrites: [],
    minimumPlan: 'growth',
    entitlement: null,
    status: 'planned',
    verification: 'unconfirmed',
    capabilitiesSource: null,
  },
  {
    id: 'yoco',
    name: 'Yoco',
    description: 'Card payments taken in person or online through Yoco.',
    category: 'payments',
    market: 'south_africa',
    priority: 'high',
    auth: 'unknown',
    viaNango: false,
    supportsSync: true,
    supportsWebhooks: false,
    intendedReads: ['transactions', 'payments', 'sales', 'refunds'],
    intendedWrites: [],
    minimumPlan: 'growth',
    entitlement: null,
    status: 'investigating',
    verification: 'unconfirmed',
    capabilitiesSource: null,
  },
  {
    id: 'payfast',
    name: 'PayFast',
    description: 'Payments collected through PayFast.',
    category: 'payments',
    market: 'south_africa',
    priority: 'standard',
    auth: 'unknown',
    viaNango: false,
    supportsSync: true,
    supportsWebhooks: false,
    intendedReads: ['transactions', 'payments', 'refunds'],
    intendedWrites: [],
    minimumPlan: 'growth',
    entitlement: null,
    status: 'investigating',
    verification: 'unconfirmed',
    capabilitiesSource: null,
  },
  {
    id: 'peach_payments',
    name: 'Peach Payments',
    description: 'Payments collected through Peach.',
    category: 'payments',
    market: 'south_africa',
    priority: 'standard',
    auth: 'unknown',
    viaNango: false,
    supportsSync: true,
    supportsWebhooks: false,
    intendedReads: ['transactions', 'payments', 'refunds'],
    intendedWrites: [],
    minimumPlan: 'growth',
    entitlement: null,
    status: 'investigating',
    verification: 'unconfirmed',
    capabilitiesSource: null,
  },

  // ── CRM ────────────────────────────────────────────────────────────────
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'Your pipeline — contacts, companies, deals and where each one has reached.',
    category: 'crm',
    market: 'global',
    priority: 'high',
    auth: 'oauth2',
    viaNango: true,
    supportsSync: true,
    supportsWebhooks: true,
    intendedReads: ['contacts', 'companies', 'deals', 'pipelines', 'activities', 'lifecycle_stages'],
    intendedWrites: [],
    minimumPlan: 'growth',
    entitlement: null,
    status: 'planned',
    verification: 'unconfirmed',
    capabilitiesSource: null,
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    description: 'Accounts, leads, opportunities and the pipeline behind them.',
    category: 'crm',
    market: 'global',
    priority: 'standard',
    auth: 'oauth2',
    viaNango: true,
    supportsSync: true,
    supportsWebhooks: true,
    intendedReads: ['accounts', 'contacts', 'leads', 'opportunities', 'pipeline', 'activities'],
    intendedWrites: [],
    minimumPlan: 'enterprise',
    entitlement: 'enterprise_connectors',
    status: 'planned',
    verification: 'unconfirmed',
    capabilitiesSource: null,
  },

  // ── Enterprise ─────────────────────────────────────────────────────────
  {
    id: 'sap',
    name: 'SAP',
    description: 'Finance, procurement, inventory and supply chain from SAP.',
    category: 'erp',
    market: 'global',
    priority: 'prepared',
    auth: 'unknown',
    viaNango: false,
    supportsSync: true,
    supportsWebhooks: false,
    intendedReads: [
      'finance',
      'procurement',
      'purchasing',
      'inventory',
      'supply_chain',
      'suppliers',
      'customers',
      'sales',
    ],
    intendedWrites: [],
    minimumPlan: 'enterprise',
    entitlement: 'enterprise_connectors',
    status: 'investigating',
    verification: 'unconfirmed',
    capabilitiesSource: null,
  },
  {
    id: 'dynamics_365',
    name: 'Microsoft Dynamics 365',
    description: 'Sales, finance, operations and service from Dynamics.',
    category: 'erp',
    market: 'global',
    priority: 'prepared',
    auth: 'oauth2',
    viaNango: true,
    supportsSync: true,
    supportsWebhooks: false,
    intendedReads: [
      'customers',
      'leads',
      'opportunities',
      'finance',
      'operations',
      'supply_chain',
      'purchasing',
      'inventory',
      'service',
    ],
    intendedWrites: [],
    minimumPlan: 'enterprise',
    entitlement: 'enterprise_connectors',
    status: 'planned',
    verification: 'unconfirmed',
    capabilitiesSource: null,
  },

  // ── Productivity ───────────────────────────────────────────────────────
  {
    id: 'microsoft_365',
    name: 'Microsoft 365',
    description: 'Chosen folders and workbooks from SharePoint, OneDrive and Excel.',
    category: 'productivity',
    market: 'global',
    priority: 'standard',
    auth: 'oauth2',
    viaNango: true,
    supportsSync: true,
    supportsWebhooks: false,
    // Deliberately narrow. The brief was explicit that Amryn must not ingest
    // every email and document, and the scopes requested have to match what
    // this list says or the consent screen tells the customer otherwise.
    intendedReads: ['excel_workbooks', 'sharepoint_files', 'onedrive_files', 'calendar'],
    intendedWrites: [],
    minimumPlan: 'professional',
    entitlement: 'microsoft_365',
    status: 'planned',
    verification: 'unconfirmed',
    capabilitiesSource: null,
  },
  {
    id: 'google_workspace',
    name: 'Google Workspace',
    description: 'Chosen spreadsheets and folders from Drive and Sheets.',
    category: 'productivity',
    market: 'global',
    priority: 'standard',
    auth: 'oauth2',
    viaNango: true,
    supportsSync: true,
    supportsWebhooks: false,
    intendedReads: ['sheets', 'drive_files', 'calendar'],
    intendedWrites: [],
    minimumPlan: 'professional',
    entitlement: 'google_workspace',
    status: 'planned',
    verification: 'unconfirmed',
    capabilitiesSource: null,
  },

  // ── Analytics ──────────────────────────────────────────────────────────
  {
    id: 'power_bi',
    name: 'Power BI',
    description: 'Datasets and the measures already built on them.',
    category: 'analytics',
    market: 'global',
    priority: 'standard',
    auth: 'oauth2',
    viaNango: true,
    supportsSync: true,
    supportsWebhooks: false,
    intendedReads: ['reports', 'dashboards', 'datasets'],
    intendedWrites: [],
    minimumPlan: 'professional',
    entitlement: 'power_bi',
    status: 'planned',
    verification: 'unconfirmed',
    capabilitiesSource: null,
  },

  // ── Commerce ───────────────────────────────────────────────────────────
  {
    id: 'shopify',
    name: 'Shopify',
    description: 'Orders, products, stock and what each sale actually netted.',
    category: 'commerce',
    market: 'global',
    priority: 'standard',
    auth: 'oauth2',
    viaNango: true,
    supportsSync: true,
    supportsWebhooks: true,
    intendedReads: ['orders', 'products', 'customers', 'inventory', 'payments', 'refunds'],
    intendedWrites: [],
    minimumPlan: 'growth',
    entitlement: null,
    status: 'planned',
    verification: 'unconfirmed',
    capabilitiesSource: null,
  },
  {
    id: 'woocommerce',
    name: 'WooCommerce',
    description: 'Orders, products, stock and refunds from your WooCommerce store.',
    category: 'commerce',
    market: 'global',
    priority: 'standard',
    auth: 'api_key',
    viaNango: true,
    supportsSync: true,
    supportsWebhooks: true,
    intendedReads: ['orders', 'products', 'customers', 'inventory', 'refunds'],
    intendedWrites: [],
    minimumPlan: 'growth',
    entitlement: null,
    status: 'planned',
    verification: 'unconfirmed',
    capabilitiesSource: null,
  },
] as const;

/* ── reading the catalogue ─────────────────────────────────────────────── */

const BY_ID = new Map(CONNECTORS.map((c) => [c.id, c]));

export function connector(id: string): ConnectorDefinition | null {
  return BY_ID.get(id) ?? null;
}

/**
 * Whether a connector may actually be switched on.
 *
 * The single gate everything else asks, so that "we have not checked this
 * provider yet" cannot be forgotten in one place while being respected in
 * another. A connector that is planned, investigating or unconfirmed is
 * visible and is not connectable.
 */
export function isConnectable(definition: ConnectorDefinition): boolean {
  return definition.status === 'available' && definition.verification === 'confirmed';
}

/** Plan ladder, cheapest first — the order that decides "does this tier reach it". */
const LADDER: readonly Plan[] = ['starter', 'growth', 'professional', 'enterprise'] as const;

/**
 * Whether a plan reaches a connector at all.
 *
 * Answers only the tier question. The entitlement and the connection quota are
 * separate gates asked separately, because they fail for different reasons and
 * the customer needs a different sentence for each — the same distinction
 * access.ts draws between "your plan does not include it" and "you have used
 * all of them".
 */
export function planReaches(plan: Plan, definition: ConnectorDefinition): boolean {
  const have = LADDER.indexOf(plan);
  const need = LADDER.indexOf(definition.minimumPlan);
  return have >= 0 && need >= 0 && have >= need;
}

/** Everything a plan carries, in catalogue order. */
export function connectorsFor(plan: Plan): ConnectorDefinition[] {
  return CONNECTORS.filter((c) => planReaches(plan, c));
}

/** Grouped for the Integrations page, which shows one section per category. */
export function byCategory(): Map<ConnectorCategory, ConnectorDefinition[]> {
  const grouped = new Map<ConnectorCategory, ConnectorDefinition[]>();
  for (const c of CONNECTORS) {
    const list = grouped.get(c.category);
    if (list) list.push(c);
    else grouped.set(c.category, [c]);
  }
  return grouped;
}

/**
 * The categories the database enum already understands.
 *
 * A connection row carries data_source_category, which has existed since
 * migration 01 and does not have a 'payments' member. Mapping here rather than
 * widening the enum keeps this slice free of a migration, and the mapping is
 * one line to remove if the enum ever grows.
 */
export function storedCategory(definition: ConnectorDefinition): string {
  switch (definition.category) {
    case 'accounting':
      return 'accounting';
    case 'crm':
      return 'crm';
    case 'erp':
      return 'erp';
    case 'commerce':
      return 'pos';
    case 'payments':
    case 'productivity':
    case 'analytics':
      return 'api';
  }
}
