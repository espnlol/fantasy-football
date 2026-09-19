import { Datasets } from '../lib/datasets';
import { num } from '../lib/csv';
import { normalizeTeam } from '../lib/teams';

/** `${team}|${week}` -> that team's dropbacks (pass attempts + sacks taken) that week. */
export async function teamDropbacksByWeek(season: number): Promise<Map<string, number>> {
  const { rows } = await Datasets.playerStats();
  const map = new Map<string, number>();
  for (const row of rows) {
    if (Number(row.season) !== season || row.season_type !== 'REG') continue;
    const attempts = num(row, 'attempts') ?? 0;
    const sacks = num(row, 'sacks') ?? 0;
    if (attempts === 0 && sacks === 0) continue;
    const key = `${normalizeTeam(row.recent_team)}|${row.week}`;
    map.set(key, (map.get(key) ?? 0) + attempts + sacks);
  }
  return map;
}
