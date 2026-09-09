/**
 * The eight Layers of an Amryn™ Imprint®, as data.
 *
 * The order is not arbitrary. Each layer is answerable from what the one
 * before established: you cannot say which site sells which product before the
 * sites exist, and you cannot say what you are trying to achieve before you
 * have said what you sell and to whom. Reordering them produces questions
 * nobody in the room can answer yet, which is how a setup flow gets abandoned
 * halfway through.
 *
 * ── why the fields are declared here and not only in the forms ────────────
 * The Quality Score has to know what a complete layer looks like, and so does
 * the analysis that later decides whether it may say anything about expansion.
 * If that list lived in the JSX, the score would be computed from whatever
 * inputs happened to be on screen — so adding a field would quietly lower
 * everybody's score, and removing one would quietly raise it, with no record
 * of either.
 *
 * Declaring it here means the form renders the list and the score reads the
 * same list. They cannot disagree, and a test asserts the forms cover it.
 *
 * ── five to seven inputs a screen ─────────────────────────────────────────
 * Not a style preference. The previous flow put an unbounded repeatable list
 * and eight system boxes on one page, and the systems step is where people
 * stopped. A screen somebody can finish is a screen somebody finishes.
 */

export const LAYER_IDS = [
  'identity',
  'location',
  'offer',
  'customers',
  'operations',
  'commercial',
  'digital',
  'intent',
] as const;

export type LayerId = (typeof LAYER_IDS)[number];

export function isLayerId(value: string): value is LayerId {
  return (LAYER_IDS as readonly string[]).includes(value);
}

/** Answered, deliberately passed over, or not yet reached. */
export type LayerState = 'unanswered' | 'answered' | 'skipped';

export interface LayerField {
  /** Matches the form input's name, and the key in the layer's answers. */
  name: string;
  label: string;
  /**
   * What the platform cannot do without it.
   *
   * Shown beside the input when it is left blank, because "why do you want
   * this?" is the question that stops somebody answering, and the honest reply
   * is usually specific and short.
   */
  whyItMatters: string;
  /**
   * Essential fields carry double weight in the Quality Score.
   *
   * A business that has given its revenue and not its trading hours is far
   * better understood than one that has done the reverse, and a score that
   * counted them equally would say otherwise.
   */
  essential?: boolean;

  /**
   * What the form renders for it.
   *
   * Declared here rather than in the JSX for the same reason the field list
   * is: one generic form reads this and renders all eight layers, so a field
   * added here appears on screen, counts towards the score, and is recorded as
   * a gap when blank — all three, or none of them. A field that existed in
   * only two of the three was the failure worth designing out.
   *
   * `repeatable` is the exception: those need a bespoke component because they
   * write to real tables (sites, systems, objectives, competitors) rather than
   * to the layer's answers, and `key` says which one.
   */
  input: 'text' | 'textarea' | 'number' | 'select' | 'repeatable';
  options?: readonly { value: string; label: string }[];
  /** Shown inside the input. A unit, not an example answer. */
  unit?: string;
  placeholder?: string;
  /** For `repeatable`, which bespoke component renders it. */
  key?: 'sites' | 'departments' | 'systems' | 'objectives' | 'competitors' | 'sectors';
}

export interface Layer {
  id: LayerId;
  /** Shown in the rail. Short enough to sit beside seven others. */
  label: string;
  title: string;
  /** Why this is being asked, in the customer's terms. */
  purpose: string;
  /**
   * Every layer but the first can be skipped, and skipping is recorded rather
   * than left blank. A single-site business should not have to invent a
   * structure, and the review screen has to tell "not applicable to us" from
   * "not got to it yet" — those need different sentences.
   */
  skippable: boolean;
  /** What is lost by skipping it. Shown on the review screen. */
  ifSkipped: string;
  /**
   * Its share of the Quality Score, out of a hundred across all eight.
   *
   * Weighted by what the analysis actually needs. Commercial carries the most
   * because a business with no figures cannot be read at all; Digital the
   * least because the platform can say a great deal about a company with no
   * website.
   */
  weight: number;
  fields: readonly LayerField[];
}

export const LAYERS: readonly Layer[] = [
  {
    id: 'identity',
    label: 'Identity',
    title: 'What the business is',
    purpose:
      'Everything else is judged against this. What you do and how big you are decides which benchmarks apply and what the model treats as normal.',
    skippable: false,
    ifSkipped: '',
    weight: 15,
    fields: [
      {
        name: 'industry',
        input: 'text', placeholder: 'Wholesale distribution',
        label: 'What the business does',
        whyItMatters: 'Decides which benchmarks and market signals are relevant to you at all.',
        essential: true,
      },
      {
        name: 'describes',
        input: 'textarea',
        label: 'How you would describe it to a stranger',
        whyItMatters: 'The one sentence everything written about your business is checked against.',
      },
      {
        name: 'headcountBand',
        input: 'select', options: [{ value: '1-10', label: '1 to 10' }, { value: '11-50', label: '11 to 50' }, { value: '51-200', label: '51 to 200' }, { value: '201-1000', label: '201 to 1,000' }, { value: '1000+', label: 'More than 1,000' }],
        label: 'Roughly how many people',
        whyItMatters: 'Revenue per head is meaningless without it, and it is the first thing any comparison needs.',
        essential: true,
      },
      {
        name: 'yearFounded',
        input: 'number',
        label: 'Year founded',
        whyItMatters: 'A dip in year two and a dip in year twenty are different events.',
      },
      {
        name: 'fiscalYearStart',
        input: 'select', options: [{ value: '1', label: 'January' }, { value: '2', label: 'February' }, { value: '3', label: 'March' }, { value: '4', label: 'April' }, { value: '5', label: 'May' }, { value: '6', label: 'June' }, { value: '7', label: 'July' }, { value: '8', label: 'August' }, { value: '9', label: 'September' }, { value: '10', label: 'October' }, { value: '11', label: 'November' }, { value: '12', label: 'December' }],
        label: 'Which month your financial year starts',
        whyItMatters: 'Without it every year-to-date figure is measured from the wrong point.',
        essential: true,
      },
      {
        name: 'timezone',
        input: 'text', placeholder: 'Africa/Johannesburg',
        label: 'Timezone',
        whyItMatters: 'Decides when a day closes, and therefore what lands in which day.',
      },
    ],
  },
  {
    id: 'location',
    label: 'Location',
    title: 'Where it operates',
    purpose:
      'Sites and departments. This is what lets performance be read by branch rather than only in total, and what a manager’s access is scoped to.',
    skippable: true,
    ifSkipped:
      'The whole business is treated as one site. You can add sites later and the figures split retrospectively.',
    weight: 10,
    fields: [
      {
        name: 'sites',
        input: 'repeatable', key: 'sites',
        label: 'Your sites',
        whyItMatters: 'Without them every figure is a single total, and a weak branch is invisible inside a healthy one.',
        essential: true,
      },
      {
        name: 'departments',
        input: 'repeatable', key: 'departments',
        label: 'Departments',
        whyItMatters: 'What lets cost and headcount be read by function rather than only by site.',
      },
      {
        name: 'premisesType',
        input: 'select', options: [{ value: 'owned', label: 'Owned' }, { value: 'leased', label: 'Leased' }, { value: 'shared', label: 'Shared or serviced' }, { value: 'mixed', label: 'A mixture' }],
        label: 'Owned, leased or shared',
        whyItMatters: 'A lease is a fixed cost with an end date, which changes what expansion means.',
      },
      {
        name: 'tradingHours',
        input: 'text', placeholder: 'Mon-Fri 08:00-17:00',
        label: 'Trading hours',
        whyItMatters: 'The model needs to know when you are open before it can say a quiet hour is unusual.',
      },
      {
        name: 'primaryCity',
        input: 'text',
        label: 'Main city or town',
        whyItMatters: 'Anchors the market signals to somewhere real rather than to the country.',
      },
    ],
  },
  {
    id: 'offer',
    label: 'Offer',
    title: 'What you sell',
    purpose:
      'What the business actually exchanges for money. Nothing about margin, pricing or demand can be said without it.',
    skippable: true,
    ifSkipped:
      'The model reads your figures without knowing what produced them, so it can report a fall in revenue and not say what stopped selling.',
    weight: 15,
    fields: [
      {
        name: 'whatYouSell',
        input: 'textarea',
        label: 'What you sell, in a sentence',
        whyItMatters: 'The difference between a product business and a service business changes almost every judgement.',
        essential: true,
      },
      {
        name: 'productCount',
        input: 'number',
        label: 'Roughly how many products or services',
        whyItMatters: 'Six lines and six thousand are different businesses with the same revenue.',
      },
      {
        name: 'topProducts',
        input: 'text', placeholder: 'Separate them with commas',
        label: 'Your three biggest sellers',
        whyItMatters: 'Concentration is a risk the model can only see if it knows what the top of the list is.',
        essential: true,
      },
      {
        name: 'pricingModel',
        input: 'select', options: [{ value: 'one-off', label: 'One-off sales' }, { value: 'recurring', label: 'Recurring or subscription' }, { value: 'usage', label: 'Usage-based' }, { value: 'mixed', label: 'A mixture' }],
        label: 'How you charge',
        whyItMatters: 'One-off, recurring and usage-based revenue behave completely differently in a forecast.',
        essential: true,
      },
      {
        name: 'averageOrderValue',
        input: 'number', unit: 'ZAR',
        label: 'Typical order value',
        whyItMatters: 'Turns a revenue change into either more customers or bigger orders, which need different responses.',
      },
      {
        name: 'deliveryMethod',
        input: 'text',
        label: 'How it reaches the customer',
        whyItMatters: 'Delivery is a cost and a constraint, and often the thing that actually limits growth.',
      },
    ],
  },
  {
    id: 'customers',
    label: 'Customers',
    title: 'Who buys from you',
    purpose:
      'Who they are, how many, and how much of the business rests on the largest of them.',
    skippable: true,
    ifSkipped:
      'Revenue is read without knowing who it comes from, so concentration risk cannot be flagged at all.',
    weight: 15,
    fields: [
      {
        name: 'customerType',
        input: 'select', options: [{ value: 'b2b', label: 'Businesses' }, { value: 'b2c', label: 'Consumers' }, { value: 'both', label: 'Both' }],
        label: 'Businesses, consumers, or both',
        whyItMatters: 'Decides which market signals apply and how long a buying decision takes.',
        essential: true,
      },
      {
        name: 'segments',
        input: 'text', placeholder: 'Separate them with commas',
        label: 'The kinds of customer you serve',
        whyItMatters: 'Lets a fall be traced to one segment rather than reported as a fall in everything.',
      },
      {
        name: 'customerCount',
        input: 'number',
        label: 'Roughly how many customers',
        whyItMatters: 'Revenue per customer is one of the few figures that means the same thing in every industry.',
        essential: true,
      },
      {
        name: 'repeatRate',
        input: 'number', unit: '%',
        label: 'How many come back',
        whyItMatters: 'The difference between a business that has to win every sale again and one that does not.',
      },
      {
        name: 'biggestCustomerShare',
        input: 'number', unit: '%',
        label: 'Share of revenue from your largest customer',
        whyItMatters: 'The single most useful number for judging how exposed the business is.',
        essential: true,
      },
      {
        name: 'acquisitionChannels',
        input: 'text', placeholder: 'Separate them with commas',
        label: 'Where new customers come from',
        whyItMatters: 'A channel that stops working is invisible until somebody has said which channels there are.',
      },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    title: 'How it runs, and where the numbers live',
    purpose:
      'Accounting, point of sale, the spreadsheet somebody maintains. Naming them is how the platform knows what it is waiting for, and what is missing when a figure looks wrong.',
    skippable: true,
    ifSkipped:
      'Nothing is expected from any system, so gaps in your data are not flagged as gaps.',
    weight: 10,
    fields: [
      {
        name: 'systems',
        input: 'repeatable', key: 'systems',
        label: 'The systems that hold your numbers',
        whyItMatters: 'What the platform connects to, and what it knows to expect data from.',
        essential: true,
      },
      {
        name: 'stockManaged',
        input: 'select', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
        label: 'Whether you hold stock',
        whyItMatters: 'Stock is usually the largest thing on the balance sheet of a business that has any.',
      },
      {
        name: 'supplierCount',
        input: 'number',
        label: 'Roughly how many suppliers',
        whyItMatters: 'Supply concentration fails the same way customer concentration does, and less visibly.',
      },
      {
        name: 'leadTimeDays',
        input: 'number', unit: 'days',
        label: 'Typical lead time, in days',
        whyItMatters: 'Decides how far ahead a demand change has to be seen to be worth acting on.',
      },
      {
        name: 'busiestPeriod',
        input: 'text', placeholder: 'November and December',
        label: 'Your busiest time of year',
        whyItMatters: 'Without it a seasonal dip is reported as a decline.',
      },
    ],
  },
  {
    id: 'commercial',
    label: 'Commercial',
    title: 'The figures you start from',
    purpose:
      'Last year’s revenue, your margins, roughly how much it costs to keep the doors open. Enough for the first read to be about your business rather than an empty template.',
    skippable: true,
    ifSkipped:
      'The Command Centre stays empty until the first import. Nothing is lost — it fills as data arrives.',
    weight: 20,
    fields: [
      {
        name: 'annualRevenue',
        input: 'number', unit: 'ZAR',
        label: 'Revenue last year',
        whyItMatters: 'The figure almost every other judgement is scaled against.',
        essential: true,
      },
      {
        name: 'grossMarginTarget',
        input: 'number', unit: '%',
        label: 'Gross margin',
        whyItMatters: 'Separates a revenue problem from a pricing problem, which need opposite responses.',
        essential: true,
      },
      {
        name: 'netMarginTarget',
        input: 'number', unit: '%',
        label: 'Net margin',
        whyItMatters: 'What is left after everything. Decides whether growth is worth having.',
      },
      {
        name: 'monthlyFixedCosts',
        input: 'number', unit: 'ZAR',
        label: 'Monthly fixed costs',
        whyItMatters: 'The number that says how long the business survives a bad quarter.',
        essential: true,
      },
      {
        name: 'revenueTargetAnnual',
        input: 'number', unit: 'ZAR',
        label: 'Revenue target for this year',
        whyItMatters: 'A target turns a number into a judgement. Without one the platform can say revenue is R4.2m and not whether that is good.',
      },
      {
        name: 'paymentTerms',
        input: 'text', placeholder: '30 days',
        label: 'How quickly customers pay',
        whyItMatters: 'The gap between a sale and the cash is where profitable businesses run out of money.',
      },
    ],
  },
  {
    id: 'digital',
    label: 'Digital',
    title: 'Where you exist online',
    purpose:
      'What can be found, watched and measured from outside. Also what the market can see of you.',
    skippable: true,
    ifSkipped:
      'Signals about your online presence are not gathered. Everything about your own figures is unaffected.',
    weight: 5,
    fields: [
      {
        name: 'website',
        input: 'text', placeholder: 'https://',
        label: 'Website',
        whyItMatters: 'The anchor for anything the platform can observe about you from outside.',
        essential: true,
      },
      {
        name: 'onlineStore',
        input: 'select', options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }],
        label: 'Whether you sell online',
        whyItMatters: 'An online channel behaves differently enough to be worth reading separately.',
      },
      {
        name: 'onlineSharePercent',
        input: 'number', unit: '%',
        label: 'Share of sales made online',
        whyItMatters: 'Says how much of the business a change in that channel actually moves.',
      },
      {
        name: 'socialChannels',
        input: 'text', placeholder: 'Separate them with commas',
        label: 'Where you are active',
        whyItMatters: 'A channel nobody has named cannot be watched.',
      },
      {
        name: 'reviewPlatforms',
        input: 'text', placeholder: 'Separate them with commas',
        label: 'Where customers review you',
        whyItMatters: 'The earliest visible sign of a problem is usually a review, not a figure.',
      },
    ],
  },
  {
    id: 'intent',
    label: 'Intent',
    title: 'What you are trying to achieve',
    purpose:
      'Targets, who you are up against, and what is actually in the way. This is what separates growth from expansion, and the two are judged differently.',
    skippable: true,
    ifSkipped:
      'Figures are reported without a view on whether they are on track, and the model cannot tell an ambition from a constraint.',
    weight: 10,
    fields: [
      {
        name: 'objectives',
        input: 'repeatable', key: 'objectives',
        label: 'What you are aiming for',
        whyItMatters: 'A target is what turns a figure into on track or behind.',
        essential: true,
      },
      {
        name: 'competitors',
        input: 'repeatable', key: 'competitors',
        label: 'Who you are up against',
        whyItMatters: 'Named competitors are watched continuously. Naming none is a fair answer.',
      },
      {
        name: 'growthHorizonMonths',
        input: 'number', unit: 'months',
        label: 'The horizon you are planning to',
        whyItMatters: 'Decides how far a simulation should run before its answer stops being useful.',
      },
      {
        name: 'expansionAppetite',
        input: 'select', options: [{ value: 'none', label: 'Not right now' }, { value: 'considering', label: 'Considering it' }, { value: 'planning', label: 'Actively planning' }, { value: 'underway', label: 'Already underway' }],
        label: 'Whether you are looking to expand',
        whyItMatters: 'Growth and expansion are different questions, and the platform keeps their answers separate.',
        essential: true,
      },
      {
        name: 'biggestConstraint',
        input: 'textarea',
        label: 'What is actually holding you back',
        whyItMatters: 'The one thing that decides which recommendations are worth making at all.',
        essential: true,
      },
      {
        name: 'sectorScope',
        input: 'repeatable', key: 'sectors',
        label: 'Who you are willing to sell to',
        whyItMatters: 'Decides whether public-sector tenders belong on your radar or are noise.',
      },
    ],
  },
];

export function layer(id: LayerId): Layer {
  // Non-null by construction: LAYER_IDS and LAYERS are the same eight, and
  // isLayerId() is the only way a caller gets a LayerId from outside.
  return LAYERS.find((l) => l.id === id)!;
}

/**
 * Which layer owns a field, or null if nothing does.
 *
 * Derived from the layer definitions rather than kept as a second map, so a
 * field moved between layers stays findable and a field that no longer exists
 * stops being. A proposal naming a field nobody defines is refused rather than
 * written into a layer that never asked for it.
 */
export function layerOwning(field: string): LayerId | null {
  for (const definition of LAYERS) {
    if (definition.fields.some((f) => f.name === field)) return definition.id;
  }
  return null;
}

export function layerIndex(id: LayerId): number {
  return LAYER_IDS.indexOf(id);
}

export function nextLayer(id: LayerId): LayerId | null {
  return LAYER_IDS[layerIndex(id) + 1] ?? null;
}

export function previousLayer(id: LayerId): LayerId | null {
  return layerIndex(id) === 0 ? null : (LAYER_IDS[layerIndex(id) - 1] ?? null);
}

/**
 * Where "continue" goes: the first layer neither answered nor skipped, or the
 * last one if every layer has had an answer of some kind.
 *
 * Computed rather than read from `current_layer` so that going back to correct
 * an earlier answer does not rewind the whole Imprint — the stored value is
 * where the customer last was, this is where the work actually stands.
 */
export function resumeAt(states: Readonly<Record<LayerId, LayerState>>): LayerId {
  for (const id of LAYER_IDS) {
    if (states[id] === 'unanswered') return id;
  }
  return LAYER_IDS[LAYER_IDS.length - 1]!;
}
