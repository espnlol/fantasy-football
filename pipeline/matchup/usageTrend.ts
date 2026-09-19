import { Datasets } from '../lib/datasets';
import { idCrosswalk } from '../lib/players';
import { normalizeTeam } from '../lib/teams';
import { ScoreComponent } from './util';

export interface UsageTrend {
  seasonAvgSnapPct: number;
  recentAvgSnapPct: number;
  recentGames: number;
  totalGames: number;
  trend: 'up' | 'down' | 'stable';
}

/**
 * Offensive snap share, season-to-date vs. the last 3 games — the best free, structured proxy for "is this
 * player's role quietly growing or shrinking" (a committee back losing touches, a receiver's routes climbing).
 * Real coach-quote or beat-reporter reporting on a role change isn't available as a free, structured, machine-
 * readable feed the way this is — see Methodology — but a real role change shows up here almost immediately.
 */
export async function getUsageTrend(gsisId: string, team: string, season: number): Promise<UsageTrend | null> {
  const [crosswalk, { rows }] = await Promise.all([idCrosswalk(), Datasets.snapCounts(season)]);
  const pfrId = crosswalk.byGsisId.get(gsisId)?.pfr_id;
  if (!pfrId) return null;

  const games = rows
    .filter((r) => r.pfr_player_id === pfrId && normalizeTeam(r.team) === normalizeTeam(team))
    .map((r) => ({ week: Number(r.week), pct: Number(r.offense_pct) || 0 }))
    .sort((a, b) => a.week - b.week);

  if (games.length < 2) return null;

  const seasonAvg = games.reduce((s, g) => s + g.pct, 0) / games.length;
  const recent = games.slice(-3);
  const recentAvg = recent.reduce((s, g) => s + g.pct, 0) / recent.length;
  const diff = recentAvg - seasonAvg;

  return {
    seasonAvgSnapPct: Math.round(seasonAvg * 1000) / 10,
    recentAvgSnapPct: Math.round(recentAvg * 1000) / 10,
    recentGames: recent.length,
    totalGames: games.length,
    trend: diff > 0.07 ? 'up' : diff < -0.07 ? 'down' : 'stable',
  };
}

/** Only meaningful once recent and season-long windows are actually different samples — skip in week 1-2. */
export function usageTrendComponent(trend: UsageTrend | null): ScoreComponent | null {
  if (!trend || trend.totalGames < 3) return null;
  const percentile = trend.trend === 'up' ? 68 : trend.trend === 'down' ? 32 : 50;
  const verb = trend.trend === 'up' ? 'up' : trend.trend === 'down' ? 'down' : 'holding steady';
  return {
    label: 'Usage trend (snap share)',
    percentile,
    weight: 1,
    detail: `Snaps ${verb}: ${trend.recentAvgSnapPct}% over the last ${trend.recentGames} game(s) vs. ${trend.seasonAvgSnapPct}% on the season. A proxy for role change, not a report of one — see Methodology.`,
  };
}
