import { describe, expect, it } from 'vitest';
import { applyToLayer, isApplicable, stillMatches } from './apply';

describe('isApplicable', () => {
  it('knows the Imprint', () => {
    expect(isApplicable('imprint_layers')).toBe(true);
  });

  it('refuses a target nothing knows how to write, rather than pretending', () => {
    // The alternative is a green tick beside a field that never moved.
    expect(isApplicable('twin_scenarios')).toBe(false);
    expect(isApplicable('financial_records')).toBe(false);
  });
});

describe('applyToLayer', () => {
  it('writes the value and stops the field counting as a gap', () => {
    const plan = applyToLayer(
      { answers: { annualRevenue: '5000000' }, gaps: ['averageOrderValue', 'repeatRate'] },
      'averageOrderValue',
      '2400',
    );

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.answers.averageOrderValue).toBe('2400');
    expect(plan.answers.annualRevenue).toBe('5000000');
    expect(plan.gaps).toEqual(['repeatRate']);
  });

  it('does not mutate what it was given', () => {
    const answers = { annualRevenue: '5000000' };
    applyToLayer({ answers, gaps: [] }, 'averageOrderValue', '2400');
    expect(answers).toEqual({ annualRevenue: '5000000' });
  });

  it('writes into an empty layer', () => {
    const plan = applyToLayer({ answers: null, gaps: null }, 'averageOrderValue', '2400');
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.answers).toEqual({ averageOrderValue: '2400' });
    expect(plan.gaps).toEqual([]);
  });

  it('refuses when the field already holds the proposed value', () => {
    const plan = applyToLayer(
      { answers: { averageOrderValue: '2400' }, gaps: [] },
      'averageOrderValue',
      '2400',
    );
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toContain('already holds');
  });

  it('refuses a proposal that names no field', () => {
    expect(applyToLayer({ answers: {}, gaps: [] }, '  ', '2400').ok).toBe(false);
  });

  it('keeps the value as text, because the engines parse at the point of use', () => {
    const plan = applyToLayer({ answers: {}, gaps: [] }, 'annualRevenue', 'R5,000,000');
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.answers.annualRevenue).toBe('R5,000,000');
  });
});

describe('stillMatches', () => {
  it('is true when nothing has moved', () => {
    expect(stillMatches({ averageOrderValue: '2400' }, 'averageOrderValue', '2400')).toBe(true);
  });

  it('is false when somebody has answered the field since', () => {
    // The proposal is stale rather than wrong: accepting would overwrite a
    // person's answer with a suggestion, and neither of them would know.
    expect(stillMatches({ averageOrderValue: '2650' }, 'averageOrderValue', null)).toBe(false);
  });

  it('treats an unanswered field and an empty answer alike', () => {
    expect(stillMatches({}, 'averageOrderValue', null)).toBe(true);
    expect(stillMatches({ averageOrderValue: '' }, 'averageOrderValue', null)).toBe(true);
    expect(stillMatches(null, 'averageOrderValue', null)).toBe(true);
  });

  it('compares as text, the way the Imprint stores it', () => {
    expect(stillMatches({ customerCount: 340 }, 'customerCount', '340')).toBe(true);
  });
});
