import { Datasets } from '../lib/datasets';
import { CsvRow, num } from '../lib/csv';
import { normalizeTeam } from '../lib/teams';
import { oLineTiersForSeason } from './oline';
import { teamDropbacksByWeek } from './dropbacks';

export interface TierBucket {
  games: number;
  pressureEvents: number;
  dropbacks: number;
  ratePct: number | null;
}

export interface PassRusherSummary {
  pfrPlayerId: string;
  name: string;
  team: string;
  games: number;
  totalPressureEvents: number;
  totalSacks: number;
  /** Pressure events (pressures+hurries+hits+sacks) per opponent dropback, season-wide. */
  pressureRatePct: number | null;
  /** The same rate, split out by the tier of O-line they were facing that game. */
  vsTierBreakdown: Record<string, TierBucket>;
}

export async function passRushProductionForTeam(defTeam: string, season: number): Promise<PassRusherSummary[]> {
  const [{ rows: defRows }, dropbacksByWeek, olineTiers] = await Promise.all([
    Datasets.advWeekDef(season),
    teamDropbacksByWeek(season),
    oLineTiersForSeason(season),
  ]);

  const byPlayer = new Map<string, CsvRow[]>();
  for (const row of defRows) {
    if (normalizeTeam(row.team) !== normalizeTeam(defTeam)) continue;
    if (!row.pfr_player_id) continue;
    const arr = byPlayer.get(row.pfr_player_id) ?? [];
    arr.push(row);
    byPlayer.set(row.pfr_player_id, arr);
  }

  const summaries: PassRusherSummary[] = [];
  for (const [pfrId, gameRows] of byPlayer) {
    let totalPressureEvents = 0;
    let totalSacks = 0;
    let totalDropbacksFaced = 0;
    const vsTier: Record<string, { games: number; pressureEvents: number; dropbacks: number }> = {};

    for (const row of gameRows) {
      const events =
        (num(row, 'def_pressures') ?? 0) +
        (num(row, 'def_times_hurried') ?? 0) +
        (num(row, 'def_times_hitqb') ?? 0) +
        (num(row, 'def_sacks') ?? 0);
      totalPressureEvents += events;
      totalSacks += num(row, 'def_sacks') ?? 0;

      const opp = normalizeTeam(row.opponent);
      const dropbacks = dropbacksByWeek.get(`${opp}|${row.week}`) ?? 0;
      totalDropbacksFaced += dropbacks;

      const tier = olineTiers.get(opp)?.tier ?? 'Average';
      const bucket = vsTier[tier] ?? { games: 0, pressureEvents: 0, dropbacks: 0 };
      bucket.games += 1;
      bucket.pressureEvents += events;
      bucket.dropbacks += dropbacks;
      vsTier[tier] = bucket;
    }

    if (totalPressureEvents === 0) continue;

    const vsTierBreakdown: Record<string, TierBucket> = {};
    for (const [tier, b] of Object.entries(vsTier)) {
      vsTierBreakdown[tier] = {
        games: b.games,
        pressureEvents: b.pressureEvents,
        dropbacks: b.dropbacks,
        ratePct: b.dropbacks > 0 ? Math.round((b.pressureEvents / b.dropbacks) * 1000) / 10 : null,
      };
    }

    summaries.push({
      pfrPlayerId: pfrId,
      name: gameRows[0].pfr_player_name,
      team: normalizeTeam(defTeam),
      games: gameRows.length,
      totalPressureEvents,
      totalSacks,
      pressureRatePct:
        totalDropbacksFaced > 0 ? Math.round((totalPressureEvents / totalDropbacksFaced) * 1000) / 10 : null,
      vsTierBreakdown,
    });
  }

  summaries.sort((a, b) => b.totalPressureEvents - a.totalPressureEvents);
  return summaries;
}
