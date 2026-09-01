/**
 * The seven steps, as data.
 *
 * The order is not arbitrary. Each step is answerable from what the previous
 * one established: you cannot say which branch owns an objective before the
 * branches exist, and you cannot judge which market signals matter before the
 * business has said what it sells. Reordering them would produce questions
 * nobody in the room can answer yet, which is how a setup flow gets abandoned.
 *
 * ── what "skip" means ─────────────────────────────────────────────────────
 * Every step but the first and the last can be skipped, and skipping is
 * recorded rather than left blank. A single-site business should not have to
 * invent a structure, and the review step has to be able to distinguish "not
 * applicable to us" from "not got to it yet" — those need different sentences.
 *
 * Identity cannot be skipped because nothing downstream works without it.
 * Review cannot be skipped because it is not a question.
 */
export const STEP_IDS = [
  'identity',
  'structure',
  'objectives',
  'systems',
  'data',
  'market',
  'review',
] as const;

export type StepId = (typeof STEP_IDS)[number];

export function isStepId(value: string): value is StepId {
  return (STEP_IDS as readonly string[]).includes(value);
}

export interface Step {
  id: StepId;
  /** Shown in the progress rail. Short enough to fit beside six others. */
  label: string;
  title: string;
  /** Why this is being asked, in the customer's terms. */
  purpose: string;
  skippable: boolean;
  /** What is lost by skipping it. Shown on the review page. */
  ifSkipped: string;
}

export const STEPS: readonly Step[] = [
  {
    id: 'identity',
    label: 'Business',
    title: 'What the business is',
    purpose:
      'Everything else is judged against this. What you sell and to whom decides which market signals are relevant, which benchmarks apply, and what the twin considers normal.',
    skippable: false,
    ifSkipped: '',
  },
  {
    id: 'structure',
    label: 'Structure',
    title: 'How it is organised',
    purpose:
      'Regions, sites and departments. This is what lets performance be read by branch rather than only in total, and what a manager’s access is scoped to.',
    skippable: true,
    ifSkipped:
      'The whole business is treated as one site. You can add branches later and the figures will split retrospectively.',
  },
  {
    id: 'objectives',
    label: 'Objectives',
    title: 'What you are trying to achieve',
    purpose:
      'A target turns a number into a judgement. Without one the platform can tell you revenue is R4.2m and not whether that is good.',
    skippable: true,
    ifSkipped:
      'Figures are reported without a view on whether they are on track. The health score falls back to trend alone.',
  },
  {
    id: 'systems',
    label: 'Systems',
    title: 'Where your numbers live',
    purpose:
      'Accounting, point of sale, the spreadsheet somebody maintains. Naming them is how the platform knows what it is waiting for, and what it is missing when a figure looks wrong.',
    skippable: true,
    ifSkipped:
      'Nothing is expected from any system, so gaps in the data are not flagged as gaps.',
  },
  {
    id: 'data',
    label: 'Data',
    title: 'What we start from',
    purpose:
      'Last year’s revenue, your margin, roughly how many customers. Enough for the first read to be about your business rather than an empty template.',
    skippable: true,
    ifSkipped:
      'The Command Centre stays empty until the first import. Nothing is lost — it fills as data arrives.',
  },
  {
    id: 'market',
    label: 'Market',
    title: 'Who you are up against',
    purpose:
      'Named competitors are watched continuously. Naming none is a fair answer — the market is still watched, just not anyone in particular.',
    skippable: true,
    ifSkipped: 'Market signals are read broadly, without anyone tracked by name.',
  },
  {
    id: 'review',
    label: 'Review',
    title: 'Review and initialise',
    purpose:
      'What you have told us, and what happens when you press the button. Anything here can be changed afterwards from settings.',
    skippable: false,
    ifSkipped: '',
  },
];

export function step(id: StepId): Step {
  // Non-null by construction: STEP_IDS and STEPS are the same seven, and
  // isStepId() is the only way a caller gets a StepId from the outside.
  return STEPS.find((s) => s.id === id)!;
}

export function stepIndex(id: StepId): number {
  return STEP_IDS.indexOf(id);
}

export function nextStep(id: StepId): StepId | null {
  return STEP_IDS[stepIndex(id) + 1] ?? null;
}

export function previousStep(id: StepId): StepId | null {
  return stepIndex(id) === 0 ? null : (STEP_IDS[stepIndex(id) - 1] ?? null);
}

export type StepState = 'done' | 'skipped' | 'current' | 'todo';

export function stepStates(
  current: StepId,
  completed: readonly string[],
  skipped: readonly string[],
): Record<StepId, StepState> {
  const out = {} as Record<StepId, StepState>;
  for (const id of STEP_IDS) {
    out[id] = completed.includes(id)
      ? 'done'
      : skipped.includes(id)
        ? 'skipped'
        : id === current
          ? 'current'
          : 'todo';
  }
  return out;
}

/**
 * Where "continue" goes: the first step that has been neither answered nor
 * skipped, or the review if every question has had an answer of some kind.
 *
 * Computed rather than read from `current_step` so that going back to edit an
 * earlier answer does not rewind the whole flow — the stored value is where
 * the customer last was, this is where the work actually stands.
 */
export function resumeAt(completed: readonly string[], skipped: readonly string[]): StepId {
  for (const id of STEP_IDS) {
    if (id === 'review') break;
    if (!completed.includes(id) && !skipped.includes(id)) return id;
  }
  return 'review';
}
