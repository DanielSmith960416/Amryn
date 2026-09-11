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

describe('the assistant reply, when there is nothing a model would add', () => {
  /*
   * The rule this file now enforces: what a customer reads is about their
   * business, never about how Amryn is put together. The reply once opened by
   * saying conversational answers were not switched on, named the engines
   * behind the figures, and closed by sending the reader to find an
   * administrator.
   */
  it('never mentions how the platform is configured', () => {
    const answers = [
      unavailableAnswer(context()),
      unavailableAnswer(
        context({ health: { score: 72.4, classification: 'steady' } } as unknown as Partial<BusinessContext>),
      ),
    ];

    for (const answer of answers) {
      expect(answer).not.toMatch(
        /model|engine|workspace|administrator|switched on|configur|conversational|feature|enabled/i,
      );
    }
  });

  /*
   * The fault this file was split out for. Every figure below is conditional,
   * and the reply used to promise them unconditionally — "Here is where things
   * stand:" followed, on a business with no figures, by a blank space. Found
   * in a screenshot rather than by a test, which is why there is one now.
   */
  it('does not announce a list it has nothing to put in', () => {
    const answer = unavailableAnswer(context());
    expect(answer).not.toContain('Here is where things stand');
  });

  it('says so in one line instead', () => {
    const answer = unavailableAnswer(context());
    expect(answer).toBe('Nothing has been recorded for this business yet.');
  });

  /*
   * "Nothing is wrong" and "nothing has been measured" look the same on a
   * screen and are completely different statements. Only the second is true of
   * a business with no figures in it.
   */
  it('never says the business is fine when it has simply not been read', () => {
    const answer = unavailableAnswer(context()).toLowerCase();
    expect(answer).not.toMatch(/all (is |looks )?(well|fine|good)|no (risks|problems|issues)\b/);
  });

  it('gives the figures, with nothing around them, once there are some', () => {
    const answer = unavailableAnswer(
      context({ health: { score: 72.4, classification: 'steady' } } as unknown as Partial<BusinessContext>),
    );
    expect(answer).toContain('Here is where things stand');
    expect(answer).toContain('Business health is 72 of 100 (steady).');
  });

  it('counts what it finds, in the customer\u2019s words', () => {
    const answer = unavailableAnswer(
      context({
        risks: [{ status: 'open' }, { status: 'open' }, { status: 'closed' }],
        opportunities: [{ stage: 'qualified' }, { stage: 'won' }],
      } as unknown as Partial<BusinessContext>),
    );
    expect(answer).toContain('2 open risks on the register.');
    expect(answer).toContain('1 live opportunity on the radar.');
  });
});
