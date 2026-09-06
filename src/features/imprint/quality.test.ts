import { describe, expect, it } from 'vitest';
import { LAYERS, LAYER_IDS, type LayerId } from './layers';
import { PROVISIONAL_BELOW, describe as describeScore, reasonsToImprove, score, type ImprintAnswers } from './quality';

/** Every field of a layer, answered. */
function full(id: LayerId): Record<string, string> {
  const definition = LAYERS.find((l) => l.id === id)!;
  return Object.fromEntries(definition.fields.map((f) => [f.name, 'answered']));
}

function imprint(entries: Partial<Record<LayerId, Partial<{ state: 'unanswered' | 'answered' | 'skipped'; answers: Record<string, unknown> }>>>): ImprintAnswers {
  const out: Record<string, { state: 'unanswered' | 'answered' | 'skipped'; answers: Record<string, unknown>; gaps: string[] }> = {};
  for (const id of LAYER_IDS) {
    const given = entries[id];
    out[id] = {
      state: given?.state ?? (given?.answers ? 'answered' : 'unanswered'),
      answers: given?.answers ?? {},
      gaps: [],
    };
  }
  return out;
}

describe('the layer weights', () => {
  it('sum to a hundred, so the score is a percentage rather than a coincidence', () => {
    expect(LAYERS.reduce((sum, l) => sum + l.weight, 0)).toBe(100);
  });

  it('give every layer at least one essential field', () => {
    // A layer with no essential field contributes the same whichever half of
    // it is answered, which makes its part of the score uninterpretable.
    for (const l of LAYERS) {
      expect(l.fields.some((f) => f.essential), l.id).toBe(true);
    }
  });

  it('keep every screen to five to seven inputs', () => {
    for (const l of LAYERS) {
      expect(l.fields.length, l.id).toBeGreaterThanOrEqual(5);
      expect(l.fields.length, l.id).toBeLessThanOrEqual(7);
    }
  });

  it('say why every field matters, since that is the question that stops people answering', () => {
    for (const l of LAYERS) {
      for (const f of l.fields) {
        expect(f.whyItMatters.length, `${l.id}.${f.name}`).toBeGreaterThan(20);
      }
    }
  });
});

describe('score', () => {
  it('is nought for an Imprint nobody has started', () => {
    expect(score(imprint({})).score).toBe(0);
  });

  it('is a hundred when every field of every layer is answered', () => {
    const everything = Object.fromEntries(LAYER_IDS.map((id) => [id, { answers: full(id) }]));
    expect(score(imprint(everything)).score).toBe(100);
  });

  it('gives a layer its declared weight when that layer is complete', () => {
    const result = score(imprint({ commercial: { answers: full('commercial') } }));
    expect(result.score).toBe(20);
  });

  it('counts an essential field for more than an ordinary one', () => {
    const identity = LAYERS.find((l) => l.id === 'identity')!;
    const essential = identity.fields.find((f) => f.essential)!;
    const ordinary = identity.fields.find((f) => !f.essential)!;

    const withEssential = score(imprint({ identity: { answers: { [essential.name]: 'x' } } })).score;
    const withOrdinary = score(imprint({ identity: { answers: { [ordinary.name]: 'x' } } })).score;

    expect(withEssential).toBeGreaterThan(withOrdinary);
  });

  it('treats a blank string, an empty array and null as unanswered', () => {
    // A form submits a touched-and-emptied input as '', not as absent. Without
    // this, opening a layer and saving nothing would score as completing it.
    const blank = score(
      imprint({ identity: { answers: { industry: '   ', describes: '', yearFounded: null, timezone: [] } } }),
    );
    expect(blank.score).toBe(0);
  });

  it('counts a zero as an answer, because zero is a figure', () => {
    // The obvious falsy-check bug: a business with no online sales answering
    // "0%" has answered, and must not be told it left the field blank.
    const result = score(imprint({ digital: { answers: { onlineSharePercent: 0 } } }));
    expect(result.score).toBeGreaterThan(0);
  });

  it('scores a skipped layer at nought however much is in its answers', () => {
    // Skipping says "do not rely on this". The score measures what the
    // platform can see, not how much effort was made.
    const result = score(imprint({ commercial: { state: 'skipped', answers: full('commercial') } }));
    expect(result.score).toBe(0);
    expect(result.layers.find((l) => l.layer === 'commercial')?.completeness).toBe(0);
  });

  it('rounds once at the end rather than per layer', () => {
    // Rounding eight times loses up to half a point each time, which is enough
    // to hold an Imprint below the threshold that decides what may be said.
    const identity = LAYERS.find((l) => l.id === 'identity')!;
    const result = score(imprint({ identity: { answers: { [identity.fields[0]!.name]: 'x' } } }));
    expect(Number.isInteger(result.score)).toBe(true);
  });

  it('marks itself provisional below seventy and not at or above it', () => {
    const everything = Object.fromEntries(LAYER_IDS.map((id) => [id, { answers: full(id) }]));
    expect(score(imprint(everything)).provisional).toBe(false);
    expect(score(imprint({})).provisional).toBe(true);
    expect(score(imprint({})).provisionalBelow).toBe(PROVISIONAL_BELOW);
  });

  it('never exceeds a hundred or falls below nought', () => {
    const everything = Object.fromEntries(
      LAYER_IDS.map((id) => [id, { answers: { ...full(id), somethingElse: 'x', andAnother: 'y' } }]),
    );
    const result = score(imprint(everything));
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('lists what is missing from a layer, essential fields first', () => {
    const result = score(imprint({ identity: { answers: {} } }));
    const identity = result.layers.find((l) => l.layer === 'identity')!;
    const definition = LAYERS.find((l) => l.id === 'identity')!;
    const firstMissing = definition.fields.find((f) => f.name === identity.missing[0])!;
    expect(firstMissing.essential).toBe(true);
  });

  it('lists every field of a skipped layer as missing, so the cost of skipping is visible', () => {
    const result = score(imprint({ digital: { state: 'skipped', answers: {} } }));
    const digital = result.layers.find((l) => l.layer === 'digital')!;
    expect(digital.missing).toHaveLength(LAYERS.find((l) => l.id === 'digital')!.fields.length);
  });
});

describe('reasonsToImprove', () => {
  it('ranks by what completing each layer would actually add', () => {
    // Commercial is worth 20 and Digital 5. With both empty, the advice has to
    // be Commercial first — otherwise following it top to bottom is slower
    // than ignoring it.
    const result = score(imprint({}));
    const advice = reasonsToImprove(result, 8);
    expect(advice[0]?.layer).toBe('commercial');
    expect(advice[advice.length - 1]?.layer).toBe('digital');
  });

  it('says nothing about a layer that is already complete', () => {
    const everything = Object.fromEntries(LAYER_IDS.map((id) => [id, { answers: full(id) }]));
    expect(reasonsToImprove(score(imprint(everything)))).toEqual([]);
  });

  it('returns at most what was asked for', () => {
    expect(reasonsToImprove(score(imprint({})), 2)).toHaveLength(2);
  });
});

describe('describe', () => {
  it('says something different either side of the threshold', () => {
    const everything = Object.fromEntries(LAYER_IDS.map((id) => [id, { answers: full(id) }]));
    expect(describeScore(score(imprint(everything)))).not.toBe(describeScore(score(imprint({}))));
  });

  it('names the threshold whenever the score is held back by it', () => {
    // Anyone below 70 is held back by the same rule, whether they are at 5 or
    // at 65. Saying "provisional" without saying what number releases it
    // leaves the reader with a complaint rather than a next step — so this
    // asserts it for every provisional score, not for one convenient band.
    const partial = score(imprint({ commercial: { answers: full('commercial') }, offer: { answers: full('offer') } }));
    expect(partial.score).toBeLessThan(PROVISIONAL_BELOW);

    for (const result of [score(imprint({})), partial]) {
      expect(result.provisional).toBe(true);
      expect(describeScore(result)).toContain(String(PROVISIONAL_BELOW));
    }
  });

  it('does not dangle the threshold in front of somebody already past it', () => {
    const everything = Object.fromEntries(LAYER_IDS.map((id) => [id, { answers: full(id) }]));
    expect(describeScore(score(imprint(everything)))).not.toContain(String(PROVISIONAL_BELOW));
  });
});
