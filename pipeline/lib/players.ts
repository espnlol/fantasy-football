import { Datasets } from './datasets';
import { CsvRow, num } from './csv';
import { normalizeTeam } from './teams';

export interface PlayerCandidate {
  gsisId: string;
  name: string;
  position: string;
  team: string;
  status: string;
  headshot: string | null;
  espnId: string | null;
}

/** roster_{season}.csv has one row per player per week; this collapses it to each player's latest snapshot. */
async function latestRosterSnapshot(season: number): Promise<Map<string, CsvRow>> {
  const { rows } = await Datasets.roster(season);
  const reg = rows.filter((r) => r.game_type === 'REG');
  const pool = reg.length > 0 ? reg : rows;
  const latest = new Map<string, CsvRow>();
  for (const row of pool) {
    if (!row.gsis_id) continue;
    const prev = latest.get(row.gsis_id);
    if (!prev || Number(row.week) > Number(prev.week)) {
      latest.set(row.gsis_id, row);
    }
  }
  return latest;
}

function toCandidate(row: CsvRow): PlayerCandidate {
  return {
    gsisId: row.gsis_id,
    name: row.full_name || `${row.first_name} ${row.last_name}`,
    position: row.position,
    team: normalizeTeam(row.team),
    status: row.status,
    headshot: row.headshot_url || null,
    espnId: row.espn_id || null,
  };
}

export async function searchRosterPlayers(query: string, season: number): Promise<PlayerCandidate[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const latest = await latestRosterSnapshot(season);
  const results: PlayerCandidate[] = [];
  for (const row of latest.values()) {
    const name = row.full_name || `${row.first_name} ${row.last_name}`;
    if (!name.toLowerCase().includes(q)) continue;
    results.push(toCandidate(row));
    if (results.length >= 25) break;
  }
  results.sort(
    (a, b) => a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q) || a.name.localeCompare(b.name),
  );
  return results;
}

export async function getRosterPlayer(gsisId: string, season: number): Promise<PlayerCandidate | null> {
  const latest = await latestRosterSnapshot(season);
  const row = latest.get(gsisId);
  return row ? toCandidate(row) : null;
}

/** Every current-roster player at the given positions — used to decide what to precompute a static bundle for. */
export async function listRosterPlayers(season: number, positions: string[]): Promise<PlayerCandidate[]> {
  const wanted = new Set(positions);
  const latest = await latestRosterSnapshot(season);
  const results: PlayerCandidate[] = [];
  for (const row of latest.values()) {
    if (!wanted.has(row.position)) continue;
    results.push(toCandidate(row));
  }
  results.sort((a, b) => a.team.localeCompare(b.team) || a.name.localeCompare(b.name));
  return results;
}

export interface Crosswalk {
  byPfrId: Map<string, CsvRow>;
  byGsisId: Map<string, CsvRow>;
}

let crosswalkCache: Crosswalk | null = null;
/** players.csv carries every ID system nflverse knows about (gsis, pfr, espn, ...) for a given human. */
export async function idCrosswalk(): Promise<Crosswalk> {
  if (crosswalkCache) return crosswalkCache;
  const { rows } = await Datasets.playersIdMap();
  const byPfrId = new Map<string, CsvRow>();
  const byGsisId = new Map<string, CsvRow>();
  for (const row of rows) {
    if (row.pfr_id) byPfrId.set(row.pfr_id, row);
    if (row.gsis_id) byGsisId.set(row.gsis_id, row);
  }
  crosswalkCache = { byPfrId, byGsisId };
  return crosswalkCache;
}

/** depth_charts_{season}.csv is a rolling log of every intraday snapshot all season, not just the current one. */
let latestDepthChartDt: { season: number; dt: string; rows: CsvRow[] } | null = null;

async function latestDepthChartSnapshot(season: number): Promise<CsvRow[]> {
  if (latestDepthChartDt && latestDepthChartDt.season === season) return latestDepthChartDt.rows;
  const { rows } = await Datasets.depthCharts(season);
  let maxDt = '';
  for (const row of rows) {
    if (row.dt > maxDt) maxDt = row.dt;
  }
  const latest = rows.filter((r) => r.dt === maxDt);
  latestDepthChartDt = { season, dt: maxDt, rows: latest };
  return latest;
}

export function clearDepthChartCache(): void {
  latestDepthChartDt = null;
}

/** Depth-chart starters (pos_rank 1) at the given PFR-style position abbreviations, e.g. ['LCB','RCB','NB']. */
export async function getStartersByPosAbb(team: string, season: number, posAbbs: string[]): Promise<CsvRow[]> {
  const rows = await latestDepthChartSnapshot(season);
  const wanted = new Set(posAbbs);
  const seen = new Set<string>();
  const starters: CsvRow[] = [];
  for (const row of rows) {
    if (normalizeTeam(row.team) !== normalizeTeam(team)) continue;
    if (!wanted.has(row.pos_abb)) continue;
    if (Number(row.pos_rank) !== 1) continue;
    const dedupeKey = row.gsis_id || row.player_name;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    starters.push(row);
  }
  return starters;
}

export interface SnapLeader {
  pfrPlayerId: string;
  name: string;
  team: string;
  totalSnaps: number;
  games: number;
}

/**
 * Actual game participation (who really played) beats a scraped depth chart, which can be stale or wrong
 * between games. Used as the primary "who's the starter" signal wherever we need one.
 */
export async function getTopSnapPlayers(
  team: string,
  season: number,
  position: string,
  snapField: 'offense_snaps' | 'defense_snaps',
  topN: number,
): Promise<SnapLeader[]> {
  const { rows } = await Datasets.snapCounts(season);
  const byPlayer = new Map<string, SnapLeader>();
  for (const row of rows) {
    if (normalizeTeam(row.team) !== normalizeTeam(team)) continue;
    if (row.position !== position) continue;
    if (!row.pfr_player_id) continue;
    const snaps = Number(row[snapField]) || 0;
    const entry = byPlayer.get(row.pfr_player_id) ?? {
      pfrPlayerId: row.pfr_player_id,
      name: row.player,
      team: normalizeTeam(team),
      totalSnaps: 0,
      games: 0,
    };
    entry.totalSnaps += snaps;
    entry.games += 1;
    byPlayer.set(row.pfr_player_id, entry);
  }
  return [...byPlayer.values()].sort((a, b) => b.totalSnaps - a.totalSnaps).slice(0, topN);
}

export async function getStartingQb(team: string, season: number): Promise<PlayerCandidate | null> {
  const snapLeaders = await getTopSnapPlayers(team, season, 'QB', 'offense_snaps', 1);
  if (snapLeaders.length > 0 && snapLeaders[0].totalSnaps > 0) {
    const crosswalk = await idCrosswalk();
    const idRow = crosswalk.byPfrId.get(snapLeaders[0].pfrPlayerId);
    if (idRow?.gsis_id) {
      return {
        gsisId: idRow.gsis_id,
        name: idRow.display_name || snapLeaders[0].name,
        position: 'QB',
        team: normalizeTeam(team),
        status: 'ACT',
        headshot: idRow.headshot || null,
        espnId: idRow.espn_id || null,
      };
    }
  }

  const depthStarters = await getStartersByPosAbb(team, season, ['QB']);
  if (depthStarters.length > 0) {
    const row = depthStarters[0];
    return {
      gsisId: row.gsis_id,
      name: row.player_name,
      position: 'QB',
      team: normalizeTeam(team),
      status: 'ACT',
      headshot: null,
      espnId: row.espn_id || null,
    };
  }
  // Fallback when the depth chart join misses: whoever has the most attempts for this team this season.
  const { rows } = await Datasets.playerStats();
  const byPlayer = new Map<string, number>();
  const nameById = new Map<string, string>();
  for (const r of rows) {
    if (Number(r.season) !== season || r.position !== 'QB') continue;
    if (normalizeTeam(r.recent_team) !== normalizeTeam(team)) continue;
    byPlayer.set(r.player_id, (byPlayer.get(r.player_id) ?? 0) + (num(r, 'attempts') ?? 0));
    nameById.set(r.player_id, r.player_display_name);
  }
  let best: string | null = null;
  let bestAttempts = -1;
  for (const [id, attempts] of byPlayer) {
    if (attempts > bestAttempts) {
      bestAttempts = attempts;
      best = id;
    }
  }
  if (!best) return null;
  return {
    gsisId: best,
    name: nameById.get(best) ?? best,
    position: 'QB',
    team: normalizeTeam(team),
    status: 'ACT',
    headshot: null,
    espnId: null,
  };
}
