import { Datasets } from '../lib/datasets';
import { num } from '../lib/csv';
import { normalizeTeam } from '../lib/teams';
import { percentileRank, tierFromPercentile, Tier } from './util';
import { teamDropbacksByWeek } from './dropbacks';

export interface OlineTier {
  team: string;
  season: number;
  /** Share of dropbacks that produced pressure on the QB, weighted across the team's QBs this season. Lower is better. */
  pressurePctAllowed: number | null;
  /** Higher = better pass protection. */
  percentile: number;
  tier: Tier;
  qbSampleAttempts: number;
  qbNames: string[];
}

/**
 * There's no free, public, per-lineman pass-block grade (that's PFF's paywalled product). This uses each
 * team's own QB pressure rate (from PFR advanced passing stats, via nflverse) as the best available free
 * proxy for that team's O-line pass-block quality — it's an offense-wide number, not a per-player grade.
 */
type TeamPressure = { totalPressures: number; totalAttempts: number; qbNames: Set<string> };

/** The season-aggregated PFR file lags behind for the in-progress season, so this falls back to summing the
 * per-game file (using each team's actual dropback count, from play-by-play, as the attempts denominator). */
async function teamPressureAllowedFromWeekly(season: number): Promise<Map<string, TeamPressure>> {
  const [{ rows }, dropbacksByWeek] = await Promise.all([Datasets.advWeekPass(season), teamDropbacksByWeek(season)]);
  const byTeam = new Map<string, TeamPressure>();
  for (const row of rows) {
    const team = normalizeTeam(row.team);
    const pressures = num(row, 'times_pressured') ?? 0;
    const dropbacks = dropbacksByWeek.get(`${team}|${row.week}`) ?? 0;
    if (dropbacks <= 0) continue;
    const entry = byTeam.get(team) ?? { totalPressures: 0, totalAttempts: 0, qbNames: new Set<string>() };
    entry.totalPressures += pressures;
    entry.totalAttempts += dropbacks;
    entry.qbNames.add(row.pfr_player_name);
    byTeam.set(team, entry);
  }
  return byTeam;
}

async function teamPressureAllowed(season: number): Promise<Map<string, TeamPressure>> {
  const { rows } = await Datasets.advSeasonPass();
  const seasonRows = rows.filter((r) => Number(r.season) === season);
  if (seasonRows.length === 0) {
    return teamPressureAllowedFromWeekly(season);
  }
  const byTeam = new Map<string, TeamPressure>();
  for (const row of seasonRows) {
    const team = normalizeTeam(row.team);
    const attempts = num(row, 'pass_attempts') ?? 0;
    const pressurePct = num(row, 'pressure_pct');
    if (attempts <= 0 || pressurePct === null) continue;
    const entry = byTeam.get(team) ?? { totalPressures: 0, totalAttempts: 0, qbNames: new Set<string>() };
    entry.totalPressures += (pressurePct / 100) * attempts;
    entry.totalAttempts += attempts;
    entry.qbNames.add(row.player);
    byTeam.set(team, entry);
  }
  return byTeam;
}

let tierCache = new Map<number, Map<string, OlineTier>>();

export async function oLineTiersForSeason(season: number): Promise<Map<string, OlineTier>> {
  const cached = tierCache.get(season);
  if (cached) return cached;

  const byTeam = await teamPressureAllowed(season);
  const weightedPct = new Map<string, number>();
  for (const [team, v] of byTeam) {
    if (v.totalAttempts > 0) weightedPct.set(team, (v.totalPressures / v.totalAttempts) * 100);
  }
  const values = [...weightedPct.values()];

  const result = new Map<string, OlineTier>();
  for (const [team, v] of byTeam) {
    const pct = weightedPct.get(team);
    const percentile = pct !== undefined ? percentileRank(values, pct, false) : 50;
    result.set(team, {
      team,
      season,
      pressurePctAllowed: pct !== undefined ? Math.round(pct * 10) / 10 : null,
      percentile: Math.round(percentile * 10) / 10,
      tier: tierFromPercentile(percentile),
      qbSampleAttempts: v.totalAttempts,
      qbNames: [...v.qbNames],
    });
  }
  tierCache.set(season, result);
  return result;
}

export async function oLineTierForTeam(team: string, season: number): Promise<OlineTier | null> {
  const tiers = await oLineTiersForSeason(season);
  return tiers.get(normalizeTeam(team)) ?? null;
}

export function clearOlineCache(): void {
  tierCache = new Map();
}
