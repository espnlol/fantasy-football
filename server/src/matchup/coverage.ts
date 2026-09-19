import { Datasets } from '../lib/datasets';
import { CsvRow, num } from '../lib/csv';
import { normalizeTeam } from '../lib/teams';
import { getTopSnapPlayers } from '../lib/players';

export interface CoverageSummary {
  pfrPlayerId: string;
  name: string;
  team: string;
  games: number;
  targets: number;
  completionsAllowed: number;
  yardsAllowed: number;
  tdAllowed: number;
  interceptions: number;
  completionPctAllowed: number | null;
  yardsPerTargetAllowed: number | null;
  /** Passer rating allowed when targeted, computed from aggregated season counts (not an average of weekly rates). */
  passerRatingAllowed: number | null;
}

function passerRatingAllowed(att: number, comp: number, yards: number, td: number, int: number): number | null {
  if (att <= 0) return null;
  const clamp = (n: number) => Math.max(0, Math.min(2.375, n));
  const a = clamp((comp / att - 0.3) * 5);
  const b = clamp((yards / att - 3) * 0.25);
  const c = clamp((td / att) * 20);
  const d = clamp(2.375 - (int / att) * 25);
  return Math.round((((a + b + c + d) / 6) * 100) * 10) / 10;
}

/** Every defender who logged coverage snaps for a team this season, aggregated from per-game PFR advanced-defense rows. */
export async function coverageStatsForTeam(defTeam: string, season: number): Promise<CoverageSummary[]> {
  const { rows } = await Datasets.advWeekDef(season);
  const byPlayer = new Map<string, CsvRow[]>();
  for (const row of rows) {
    if (normalizeTeam(row.team) !== normalizeTeam(defTeam)) continue;
    if (!row.pfr_player_id) continue;
    const arr = byPlayer.get(row.pfr_player_id) ?? [];
    arr.push(row);
    byPlayer.set(row.pfr_player_id, arr);
  }

  const summaries: CoverageSummary[] = [];
  for (const [pfrId, gameRows] of byPlayer) {
    const targets = gameRows.reduce((s, r) => s + (num(r, 'def_targets') ?? 0), 0);
    if (targets === 0) continue;
    const completions = gameRows.reduce((s, r) => s + (num(r, 'def_completions_allowed') ?? 0), 0);
    const yards = gameRows.reduce((s, r) => s + (num(r, 'def_yards_allowed') ?? 0), 0);
    const td = gameRows.reduce((s, r) => s + (num(r, 'def_receiving_td_allowed') ?? 0), 0);
    const ints = gameRows.reduce((s, r) => s + (num(r, 'def_ints') ?? 0), 0);

    summaries.push({
      pfrPlayerId: pfrId,
      name: gameRows[0].pfr_player_name,
      team: normalizeTeam(defTeam),
      games: gameRows.length,
      targets,
      completionsAllowed: completions,
      yardsAllowed: yards,
      tdAllowed: td,
      interceptions: ints,
      completionPctAllowed: Math.round((completions / targets) * 1000) / 10,
      yardsPerTargetAllowed: Math.round((yards / targets) * 10) / 10,
      passerRatingAllowed: passerRatingAllowed(targets, completions, yards, td, ints),
    });
  }

  summaries.sort((a, b) => b.targets - a.targets);
  return summaries;
}

/**
 * Coverage stats for this team's most-used cornerbacks this season, by actual defensive snaps played (ground
 * truth from real games) rather than a scraped depth chart — not a per-play "who covered whom" charting, since
 * that data (PFF/NGS) isn't public. Falls back to the most-targeted defenders on file if snap data is empty
 * (e.g. before week 1).
 */
export async function startingCornerbackCoverage(defTeam: string, season: number): Promise<CoverageSummary[]> {
  const [allCoverage, snapLeaders] = await Promise.all([
    coverageStatsForTeam(defTeam, season),
    getTopSnapPlayers(defTeam, season, 'CB', 'defense_snaps', 3),
  ]);

  const leaderIds = new Set(snapLeaders.map((s) => s.pfrPlayerId));
  const filtered = allCoverage.filter((c) => leaderIds.has(c.pfrPlayerId));
  return filtered.length > 0 ? filtered : allCoverage.slice(0, 3);
}
