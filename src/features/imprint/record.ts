import 'server-only';

/**
 * Reading an Imprint.
 *
 * One function, used by every screen that shows any part of one — the rail,
 * each layer, the review, and the prompt on the Command Centre. They cannot
 * disagree about how complete an Imprint is, because there is one computation
 * and several renderings of it, which is the same seam the workspace uses.
 */
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { LAYER_IDS, resumeAt, type LayerId, type LayerState } from './layers';
import { score, type ImprintAnswers, type QualityScore } from './quality';

export interface LayerRecord {
  layer: LayerId;
  state: LayerState;
  answers: Record<string, unknown>;
  gaps: string[];
  answeredAt: string | null;
}

export interface ImprintRecord {
  organisationId: string;
  layers: Record<LayerId, LayerRecord>;
  /** Where "continue" goes, computed from what is answered rather than stored. */
  resumeAt: LayerId;
  completedAt: string | null;
  initialisedAt: string | null;
  /**
   * Recomputed on every read rather than trusted from the column.
   *
   * The stored figure is what the analysis reads when nobody is looking at a
   * screen; this is what a person is shown. Computing it here means a screen
   * can never display a score that is stale relative to the answers directly
   * beside it — which is the one place the difference would be obvious and
   * would undermine the number everywhere else.
   */
  quality: QualityScore;
  /** What is in the column, for saying so when the two differ. */
  storedScore: number | null;
}

function emptyLayers(): Record<LayerId, LayerRecord> {
  // Built by assignment rather than Object.fromEntries: the latter is typed as
  // an index signature, so the compiler cannot see that all eight keys are
  // present and the only way past it is a cast — which would then keep
  // compiling if a layer were ever dropped from the list.
  const layers = {} as Record<LayerId, LayerRecord>;
  for (const layer of LAYER_IDS) {
    layers[layer] = {
      layer,
      state: 'unanswered' satisfies LayerState,
      answers: {},
      gaps: [],
      answeredAt: null,
    };
  }
  return layers;
}

/**
 * The organisation's Imprint, opening one if it does not exist yet.
 *
 * Cached per request: the review screen asks for it while rendering eight
 * panels, and the rail asks again.
 */
export const imprintFor = cache(async (organisationId: string): Promise<ImprintRecord> => {
  const supabase = await createClient();

  // Idempotent, and the reason a first-time visitor sees eight layers rather
  // than an empty page that has to explain itself.
  await supabase.rpc('ensure_imprint', { p_organisation: organisationId });

  const [{ data: record }, { data: rows }] = await Promise.all([
    supabase
      .from('imprint_records')
      .select('completed_at, initialised_at, quality_score')
      .eq('organisation_id', organisationId)
      .maybeSingle(),
    supabase
      .from('imprint_layers')
      .select('layer, state, answers, gaps, answered_at')
      .eq('organisation_id', organisationId),
  ]);

  const layers = emptyLayers();
  for (const row of rows ?? []) {
    const id = row.layer as LayerId;
    if (!(id in layers)) continue;
    layers[id] = {
      layer: id,
      state: row.state as LayerState,
      answers: (row.answers as Record<string, unknown> | null) ?? {},
      gaps: row.gaps ?? [],
      answeredAt: row.answered_at,
    };
  }

  const answers = {} as Record<LayerId, { state: LayerState; answers: Record<string, unknown>; gaps: string[] }>;
  const states = {} as Record<LayerId, LayerState>;
  for (const id of LAYER_IDS) {
    answers[id] = { state: layers[id].state, answers: layers[id].answers, gaps: layers[id].gaps };
    states[id] = layers[id].state;
  }

  return {
    organisationId,
    layers,
    resumeAt: resumeAt(states),
    completedAt: record?.completed_at ?? null,
    initialisedAt: record?.initialised_at ?? null,
    quality: score(answers satisfies ImprintAnswers),
    storedScore: record?.quality_score ?? null,
  };
});
