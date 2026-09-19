import { Datasets } from '../lib/datasets';
import { num } from '../lib/csv';
import { normalizeTeam } from '../lib/teams';
import { percentileRank, tierFromPercentile, Tier } from './util';

export interface AllowedSplit {
  team: string;
  season: number;
  games: number;
  perGame: {
    receptions: number;
    targets: number;
    recYards: number;
    recTd: number;
    carries: number;
    rushYards: number;
    rushTd: number;
    pprPoints: number;
  };
  /** Higher = this defense allows MORE fantasy production to the position (a more favorable matchup). */
  percentileAgainstPosition: number;
  tier: Tier;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

let allowedCache = new Map<string, Map<string, AllowedSplit>>();

export async function allowedSplitsForSeason(season: number, position: 'WR' | 'RB'): Promise<Map<string, AllowedSplit>> {
  const cacheKey = `${season}|${position}`;
  const cached = allowedCache.get(cacheKey);
  if (cached) return cached;

  const { rows } = await Datasets.playerStats();
  const byTeam = new Map<string, { games: Set<string>; totals: Record<string, number> }>();
  for (const row of rows) {
    if (Number(row.season) !== season || row.season_type !== 'REG') continue;
    if (row.position !== position) continue;
    const opp = normalizeTeam(row.opponent_team);
    const entry = byTeam.get(opp) ?? {
      games: new Set<string>(),
      totals: { receptions: 0, targets: 0, recYards: 0, recTd: 0, carries: 0, rushYards: 0, rushTd: 0, pprPoints: 0 },
    };
    entry.games.add(`${row.season}-${row.week}`);
    entry.totals.receptions += num(row, 'receptions') ?? 0;
    entry.totals.targets += num(row, 'targets') ?? 0;
    entry.totals.recYards += num(row, 'receiving_yards') ?? 0;
    entry.totals.recTd += num(row, 'receiving_tds') ?? 0;
    entry.totals.carries += num(row, 'carries') ?? 0;
    entry.totals.rushYards += num(row, 'rushing_yards') ?? 0;
    entry.totals.rushTd += num(row, 'rushing_tds') ?? 0;
    entry.totals.pprPoints += num(row, 'fantasy_points_ppr') ?? 0;
    byTeam.set(opp, entry);
  }

  const ppgByTeam = new Map<string, number>();
  for (const [team, v] of byTeam) {
    const g = v.games.size || 1;
    ppgByTeam.set(team, v.totals.pprPoints / g);
  }
  const values = [...ppgByTeam.values()];

  const result = new Map<string, AllowedSplit>();
  for (const [team, v] of byTeam) {
    const g = v.games.size || 1;
    const ppg = v.totals.pprPoints / g;
    const pct = percentileRank(values, ppg, true);
    result.set(team, {
      team,
      season,
      games: g,
      perGame: {
        receptions: round1(v.totals.receptions / g),
        targets: round1(v.totals.targets / g),
        recYards: round1(v.totals.recYards / g),
        recTd: round1(v.totals.recTd / g),
        carries: round1(v.totals.carries / g),
        rushYards: round1(v.totals.rushYards / g),
        rushTd: round1(v.totals.rushTd / g),
        pprPoints: round1(ppg),
      },
      percentileAgainstPosition: Math.round(pct * 10) / 10,
      tier: tierFromPercentile(pct),
    });
  }
  allowedCache.set(cacheKey, result);
  return result;
}

export async function allowedSplitForTeam(team: string, season: number, position: 'WR' | 'RB'): Promise<AllowedSplit | null> {
  const map = await allowedSplitsForSeason(season, position);
  return map.get(normalizeTeam(team)) ?? null;
}

export async function recentAllowed(
  team: string,
  season: number,
  position: 'WR' | 'RB',
  lastN = 4,
): Promise<{ games: number; pprPointsPerGame: number } | null> {
  const { rows } = await Datasets.playerStats();
  const opp = normalizeTeam(team);
  const byWeek = new Map<number, number>();
  for (const row of rows) {
    if (Number(row.season) !== season || row.season_type !== 'REG') continue;
    if (row.position !== position) continue;
    if (normalizeTeam(row.opponent_team) !== opp) continue;
    const wk = Number(row.week);
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + (num(row, 'fantasy_points_ppr') ?? 0));
  }
  const weeks = [...byWeek.keys()].sort((a, b) => b - a).slice(0, lastN);
  if (weeks.length === 0) return null;
  const total = weeks.reduce((s, w) => s + (byWeek.get(w) ?? 0), 0);
  return { games: weeks.length, pprPointsPerGame: round1(total / weeks.length) };
}

export function clearAllowedCache(): void {
  allowedCache = new Map();
}
