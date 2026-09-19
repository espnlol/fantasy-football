import { Datasets } from '../lib/datasets';
import { addComponent, CompositeResult, ScoreComponent } from './util';

export interface InjuryStatus {
  /** 'Out' | 'Doubtful' | 'Questionable' | 'Healthy' — 'Healthy' covers both "never on a report" and "was on
   * the report but cleared with no game designation." */
  status: string;
  primaryInjury: string | null;
  practiceStatus: string | null;
  asOfWeek: number;
}

/** The official weekly report, not a Twitter/beat-reporter feed — see Methodology for why. */
export async function getInjuryStatus(gsisId: string, season: number, week: number): Promise<InjuryStatus | null> {
  const { rows } = await Datasets.injuries(season);
  const candidates = rows.filter((r) => r.gsis_id === gsisId && Number(r.week) <= week);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => Number(b.week) - Number(a.week));
  const latest = candidates[0];
  return {
    status: latest.report_status || 'Healthy',
    primaryInjury: latest.report_primary_injury || latest.practice_primary_injury || null,
    practiceStatus: latest.practice_status || null,
    asOfWeek: Number(latest.week),
  };
}

/**
 * Out/Doubtful hard-cap the lean to Avoid regardless of how good the matchup looks — recommending a "Start" for
 * someone who's very unlikely to play would be actively misleading. The underlying matchup score is left
 * visible (weight 0 on that component) so "how good would this matchup be if healthy" isn't lost. Questionable
 * is a soft penalty instead: most Questionable tags do end up playing.
 */
export function applyInjuryToResult(result: CompositeResult, injury: InjuryStatus | null): CompositeResult {
  if (!injury || injury.status === 'Healthy') return result;

  const injuryNote = injury.primaryInjury ? ` — ${injury.primaryInjury}` : '';

  if (injury.status === 'Out' || injury.status === 'Doubtful') {
    const component: ScoreComponent = {
      label: `Injury status: ${injury.status}`,
      percentile: 0,
      weight: 0,
      detail: `Listed as ${injury.status}${injuryNote} (week ${injury.asOfWeek} report). Overrides the matchup-based lean below regardless of score — very unlikely to play a full workload.`,
    };
    return { ...result, lean: 'Avoid', components: [component, ...result.components] };
  }

  // Questionable
  const component: ScoreComponent = {
    label: 'Injury status: Questionable',
    percentile: 35,
    weight: 2,
    detail: `Listed as Questionable${injuryNote} (week ${injury.asOfWeek} report). Most Questionable tags do end up playing — recheck closer to kickoff.`,
  };
  return addComponent(result, component, true);
}
