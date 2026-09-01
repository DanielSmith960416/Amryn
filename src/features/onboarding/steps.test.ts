import { describe, expect, it } from 'vitest';
import {
  STEPS,
  STEP_IDS,
  isStepId,
  nextStep,
  previousStep,
  resumeAt,
  step,
  stepStates,
} from './steps';

describe('the seven steps', () => {
  it('has one definition per id, in the same order', () => {
    expect(STEPS.map((s) => s.id)).toEqual([...STEP_IDS]);
  });

  it('rejects a step id it does not recognise', () => {
    expect(isStepId('identity')).toBe(true);
    expect(isStepId('Identity')).toBe(false);
    expect(isStepId('pricing')).toBe(false);
  });

  // The two that cannot be skipped, and why: nothing downstream works without
  // identity, and review is not a question.
  it('allows skipping everything except identity and review', () => {
    expect(step('identity').skippable).toBe(false);
    expect(step('review').skippable).toBe(false);
    for (const id of STEP_IDS) {
      if (id === 'identity' || id === 'review') continue;
      expect(step(id).skippable, id).toBe(true);
    }
  });

  it('says what skipping costs, for every step that can be skipped', () => {
    for (const s of STEPS) {
      if (!s.skippable) continue;
      expect(s.ifSkipped.length, s.id).toBeGreaterThan(20);
    }
  });

  it('walks forwards and backwards, and stops at both ends', () => {
    expect(previousStep('identity')).toBeNull();
    expect(nextStep('identity')).toBe('structure');
    expect(nextStep('market')).toBe('review');
    expect(nextStep('review')).toBeNull();
    expect(previousStep('review')).toBe('market');
  });
});

describe('resumeAt', () => {
  it('starts at the beginning when nothing has been answered', () => {
    expect(resumeAt([], [])).toBe('identity');
  });

  it('goes to the first question with no answer of any kind', () => {
    expect(resumeAt(['identity'], [])).toBe('structure');
    expect(resumeAt(['identity'], ['structure'])).toBe('objectives');
  });

  // The case that decides whether skipping works at all: a skipped step must
  // not be offered again as the place to resume, or "skip" is a no-op that
  // returns you to the same question at the next sitting.
  it('treats a skipped step as answered for the purpose of resuming', () => {
    expect(resumeAt([], ['identity', 'structure', 'objectives'])).toBe('systems');
  });

  it('lands on review once every question has had an answer', () => {
    expect(resumeAt(['identity', 'structure', 'objectives'], ['systems', 'data', 'market'])).toBe(
      'review',
    );
  });

  // Going back to change an earlier answer must not rewind the flow: what
  // matters is where the work stands, not where the customer last was.
  it('does not rewind because an answered step is being edited', () => {
    const completed = ['identity', 'structure', 'objectives', 'systems', 'data', 'market'];
    expect(resumeAt(completed, [])).toBe('review');
  });

  it('ignores a step id it does not know', () => {
    expect(resumeAt(['identity', 'pricing'], [])).toBe('structure');
  });
});

describe('stepStates', () => {
  it('marks each of the seven exactly once', () => {
    const states = stepStates('objectives', ['identity'], ['structure']);
    expect(states.identity).toBe('done');
    expect(states.structure).toBe('skipped');
    expect(states.objectives).toBe('current');
    expect(states.systems).toBe('todo');
    expect(Object.keys(states)).toHaveLength(STEP_IDS.length);
  });

  // Done wins over current, so revisiting an answered step shows it as
  // answered rather than as unfinished work.
  it('shows an answered step as done even while it is being edited', () => {
    expect(stepStates('identity', ['identity'], []).identity).toBe('done');
  });
});
