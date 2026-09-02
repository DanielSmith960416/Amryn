/**
 * The seam between the Intelligence Layer and everything that renders it.
 *
 * Every screen in the client area, and the weekly PDF, reads one `Workspace`.
 * That is the whole point of the shape: the report and the screen cannot
 * disagree, because there is only one computation and they both read its
 * output.
 *
 * Three sources, and the difference between them is the difference between a
 * product and a demonstration of one:
 *
 *   · `organisationWorkspace()` — the customer's own rows, through the same
 *     engines. What a paying customer sees.
 *   · `null` — a real organisation that has imported nothing yet. The screens
 *     say what to connect. Not zeros, which the health engine would report as
 *     a diagnosis, and not somebody else's figures.
 *   · `loadWorkspace()` — the demonstration business, for a sales demo and for
 *     the tests. Marked `isDemo`, and every screen says so.
 *
 * `currentWorkspace()` chooses. Until this existed, all sixteen screens called
 * `loadWorkspace()` directly and every customer saw the demonstration company
 * — including one who had just spent twenty minutes describing their own.
 */
export type { InventoryView, Workspace } from './demo';
export { loadWorkspace } from './demo';
export { organisationWorkspace } from './from-database';
export { emptyInventory } from './inventory';
export { currentWorkspace, type WorkspaceState } from './current';
