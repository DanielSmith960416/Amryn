import type { ProfileState } from './schemas';

/**
 * What a settings form says after it is submitted.
 *
 * One component for all four of them, so a failure and a confirmation read the
 * same wherever they appear — and so that `role` is right in both cases
 * without each form remembering. A failure is an alert because it interrupts
 * what somebody was doing; a confirmation is a status because it does not.
 */
export function Outcome({ state }: { state: ProfileState }) {
  if (state.status === 'error') {
    return (
      <p className="text-[0.8125rem] text-[var(--negative)]" role="alert">
        {state.message}
      </p>
    );
  }

  if (state.status === 'saved') {
    return (
      <p className="text-[0.8125rem] text-[var(--positive)]" role="status">
        {state.message}
      </p>
    );
  }

  return null;
}
