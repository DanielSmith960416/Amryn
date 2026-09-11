import { describe, expect, it } from 'vitest';

import type { BusinessContext } from '@/types/intelligence';
import { unavailableAnswer } from './unavailable';

/** Only the fields this answer reads. The rest of a context is irrelevant here. */
function context(overrides: Partial<BusinessContext> = {}): BusinessContext {
  return {
    health: null,
    anomalies: [],
    risks: [],
    opportunities: [],
    ...overrides,
  } as unknown as BusinessContext;
}

describe('what the assistant says with no model configured', () => {
  /*
   * The fault this file was split out for. Every figure below is conditional,
   * and the answer used to promise them unconditionally — "Here is where
   * things stand:" followed, on a workspace with no figures, by a blank space.
   * Found in a screenshot rather than by a test, which is why there is one now.
   */
  it('does not announce a list it has nothing to put in', () => {
    const answer = unavailableAnswer(context());
    expect(answer).not.toContain('Here is where things stand');
  });

  it('says why there is nothing, rather than leaving a gap', () => {
    const answer = unavailableAnswer(context());
    expect(answer).toContain('nothing to report yet');
    expect(answer).toContain('no figures have been brought in');
  });

  /*
   * "Nothing is wrong" and "nothing has been measured" look the same on a
   * screen and are completely different statements. Only the second is true
   * of an empty workspace, and it is the one a customer needs.
   */
  it('never says the business is fine when it has simply not been read', () => {
    const answer = unavailableAnswer(context()).toLowerCase();
    expect(answer).not.toMatch(/all (is |looks )?(well|fine|good)|no (risks|problems|issues)\b/);
  });

  it('announces the list once there is something in it', () => {
    const answer = unavailableAnswer(
      context({ health: { score: 72.4, classification: 'steady' } } as unknown as Partial<BusinessContext>),
    );
    expect(answer).toContain('Here is where things stand');
    expect(answer).toContain('Business health is 72 of 100 (steady).');
  });

  it('counts what it finds, in the customer’s words', () => {
    const answer = unavailableAnswer(
      context({
        risks: [{ status: 'open' }, { status: 'open' }, { status: 'closed' }],
        opportunities: [{ stage: 'qualified' }, { stage: 'won' }],
      } as unknown as Partial<BusinessContext>),
    );
    expect(answer).toContain('2 open risks on the register.');
    expect(answer).toContain('1 live opportunity on the radar.');
  });

  it('leaves whoever asked with something to do, either way', () => {
    for (const answer of [unavailableAnswer(context()), unavailableAnswer(context({ risks: [{ status: 'open' }] } as unknown as Partial<BusinessContext>))]) {
      expect(answer).toContain('Ask an administrator');
    }
  });
});
