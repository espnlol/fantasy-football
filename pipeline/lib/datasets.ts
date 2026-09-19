import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { parse as parseCsvStream } from 'csv-parse';
import { fetchTextCached, fetchBufferCached } from './cache';
import { parseCsv, CsvRow } from './csv';

const gunzip = promisify(zlib.gunzip);
/** Hands control back to the event loop (a macrotask, not just a microtask) so a long parse loop can't starve
 * incoming HTTP requests — this app has been observed to make the whole server briefly unresponsive without it. */
const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

const BASE = 'https://github.com/nflverse/nflverse-data/releases/download';
const HOUR = 60 * 60 * 1000;

type Loaded = { rows: CsvRow[]; fetchedAt: number; stale: boolean };
const memCache = new Map<string, Loaded>();

async function loadCsv(url: string, key: string, ttlMs: number, force: boolean): Promise<Loaded> {
  if (!force) {
    const mem = memCache.get(key);
    if (mem) return mem;
  }
  const { text, fetchedAt, stale } = await fetchTextCached(url, { key, ttlMs: force ? 0 : ttlMs });
  const rows = parseCsv(text);
  const entry: Loaded = { rows, fetchedAt, stale };
  memCache.set(key, entry);
  return entry;
}

/**
 * nflverse's convenience "player_stats" release (weekly fantasy/box-score stats with opponent) has been frozen
 * since May 2025 — it stops mid-way through the 2024 season and was never updated for 2025/2026, on both its
 * combined file and its per-season/offense/defense/kicking variants. Rather than serve silently stale data, this
 * rebuilds the same shape directly from nflverse's play-by-play release (the "pbp" tag), which IS updated same-day.
 * Fantasy points are computed here as standard full-PPR from the aggregated box score; a league's exact scoring
 * settings (0.5 PPR, TE premium, return TDs, 2pt/fumble rules) may differ slightly from this.
 */
interface WeeklyAgg {
  playerId: string;
  team: string;
  opponent: string;
  season: number;
  week: number;
  completions: number;
  attempts: number;
  passingYards: number;
  passingTds: number;
  interceptions: number;
  sacks: number;
  carries: number;
  rushingYards: number;
  rushingTds: number;
  receptions: number;
  targets: number;
  receivingYards: number;
  receivingTds: number;
  fallbackName: string;
}

async function aggregatePbpSeason(season: number, force: boolean): Promise<Map<string, WeeklyAgg>> {
  const url = `${BASE}/pbp/play_by_play_${season}.csv.gz`;
  const { buffer } = await fetchBufferCached(url, { key: `pbp_${season}_gz`, ttlMs: force ? 0 : 6 * HOUR });
  const text = (await gunzip(buffer)).toString('utf8');

  const agg = new Map<string, WeeklyAgg>();
  const get = (playerId: string, team: string, opponent: string, week: number): WeeklyAgg => {
    const key = `${week}-${playerId}`;
    let row = agg.get(key);
    if (!row) {
      row = {
        playerId,
        team,
        opponent,
        season,
        week,
        completions: 0,
        attempts: 0,
        passingYards: 0,
        passingTds: 0,
        interceptions: 0,
        sacks: 0,
        carries: 0,
        rushingYards: 0,
        rushingTds: 0,
        receptions: 0,
        targets: 0,
        receivingYards: 0,
        receivingTds: 0,
        fallbackName: '',
      };
      agg.set(key, row);
    }
    return row;
  };

  // Handing the parser the whole 100MB+ decompressed string in one write() lets it tokenize a huge chunk
  // synchronously before the first record is even readable, which was observed to stall the server for
  // several seconds despite the per-record yields below. Feeding it in small pieces (respecting backpressure)
  // bounds each synchronous tokenizing pass to one piece instead of the whole file.
  const parser = parseCsvStream({ columns: true, skip_empty_lines: true, relax_column_count: true });
  const feed = (async () => {
    const CHUNK = 65536;
    for (let i = 0; i < text.length; i += CHUNK) {
      if (!parser.write(text.slice(i, i + CHUNK))) {
        await new Promise<void>((resolve) => parser.once('drain', resolve));
      } else {
        await yieldToEventLoop();
      }
    }
    parser.end();
  })();

  let sinceYield = 0;
  for await (const record of parser as AsyncIterable<CsvRow>) {
    if (record.season_type === 'REG') {
      const week = Number(record.week);
      const posteam = record.posteam;
      const defteam = record.defteam;

      if (posteam && defteam && week) {
        if (record.passer_player_id) {
          const r = get(record.passer_player_id, posteam, defteam, week);
          r.fallbackName = record.passer_player_name || r.fallbackName;
          if (record.pass_attempt === '1') r.attempts += 1;
          if (record.complete_pass === '1') {
            r.completions += 1;
            r.passingYards += Number(record.passing_yards) || 0;
          }
          if (record.pass_touchdown === '1') r.passingTds += 1;
          if (record.interception === '1') r.interceptions += 1;
          if (record.sack === '1') r.sacks += 1;
        }
        if (record.receiver_player_id) {
          const r = get(record.receiver_player_id, posteam, defteam, week);
          r.fallbackName = record.receiver_player_name || r.fallbackName;
          r.targets += 1;
          if (record.complete_pass === '1') {
            r.receptions += 1;
            r.receivingYards += Number(record.receiving_yards) || 0;
            if (record.pass_touchdown === '1') r.receivingTds += 1;
          }
        }
        if (record.rusher_player_id) {
          const r = get(record.rusher_player_id, posteam, defteam, week);
          r.fallbackName = record.rusher_player_name || r.fallbackName;
          r.carries += 1;
          r.rushingYards += Number(record.rushing_yards) || 0;
          if (record.rush_touchdown === '1') r.rushingTds += 1;
        }
      }
    }

    // Bare `for await` over a stream can resolve entirely on microtasks when data is already buffered, which
    // never gives the event loop a chance to accept/serve other requests. Forcing a real yield periodically
    // is what actually keeps the server responsive during this — see the comment on yieldToEventLoop above.
    if (++sinceYield >= 2000) {
      sinceYield = 0;
      await yieldToEventLoop();
    }
  }
  await feed;

  return agg;
}

let playerStatsCache: Loaded | null = null;

async function buildPlayerStatsFromPbp(force: boolean): Promise<Loaded> {
  if (!force && playerStatsCache) return playerStatsCache;

  const season = currentSeason();
  const seasons = [season, season - 1, season - 2];

  const [seasonAggs, idMapLoaded] = await Promise.all([
    Promise.all(
      seasons.map((s) =>
        aggregatePbpSeason(s, force).catch((err) => {
          console.warn(`[pbp] failed to load season ${s}: ${(err as Error).message}`);
          return new Map<string, WeeklyAgg>();
        }),
      ),
    ),
    loadCsv(`${BASE}/players/players.csv`, 'players', 24 * HOUR, force),
  ]);

  const byGsis = new Map<string, CsvRow>();
  for (const row of idMapLoaded.rows) {
    if (row.gsis_id) byGsis.set(row.gsis_id, row);
  }

  const rows: CsvRow[] = [];
  for (const seasonAgg of seasonAggs) {
    for (const a of seasonAgg.values()) {
      const idRow = byGsis.get(a.playerId);
      const position = idRow?.position || '';
      const name = idRow?.display_name || a.fallbackName;
      const pprPoints =
        0.04 * a.passingYards +
        4 * a.passingTds -
        2 * a.interceptions +
        0.1 * a.rushingYards +
        6 * a.rushingTds +
        0.1 * a.receivingYards +
        6 * a.receivingTds +
        1 * a.receptions;
      rows.push({
        player_id: a.playerId,
        player_display_name: name,
        position,
        recent_team: a.team,
        season: String(a.season),
        week: String(a.week),
        season_type: 'REG',
        opponent_team: a.opponent,
        completions: String(a.completions),
        attempts: String(a.attempts),
        passing_yards: String(a.passingYards),
        passing_tds: String(a.passingTds),
        interceptions: String(a.interceptions),
        sacks: String(a.sacks),
        carries: String(a.carries),
        rushing_yards: String(a.rushingYards),
        rushing_tds: String(a.rushingTds),
        receptions: String(a.receptions),
        targets: String(a.targets),
        receiving_yards: String(a.receivingYards),
        receiving_tds: String(a.receivingTds),
        fantasy_points_ppr: String(Math.round(pprPoints * 10) / 10),
      });
    }
  }

  const entry: Loaded = { rows, fetchedAt: Date.now(), stale: false };
  playerStatsCache = entry;
  return entry;
}

export const Datasets = {
  /** Weekly per-player box scores with opponent, rebuilt from play-by-play — see buildPlayerStatsFromPbp for why. */
  playerStats: (force = false) => buildPlayerStatsFromPbp(force),
  playersIdMap: (force = false) => loadCsv(`${BASE}/players/players.csv`, 'players', 24 * HOUR, force),
  roster: (season: number, force = false) =>
    loadCsv(`${BASE}/rosters/roster_${season}.csv`, `roster_${season}`, 6 * HOUR, force),
  games: (force = false) => loadCsv(`${BASE}/schedules/games.csv`, 'games', 3 * HOUR, force),
  snapCounts: (season: number, force = false) =>
    loadCsv(`${BASE}/snap_counts/snap_counts_${season}.csv`, `snap_${season}`, 6 * HOUR, force),
  depthCharts: (season: number, force = false) =>
    loadCsv(`${BASE}/depth_charts/depth_charts_${season}.csv`, `depth_${season}`, 3 * HOUR, force),
  /** Per-game defensive coverage + pass-rush stats (PFR via nflverse). One file per season. */
  advWeekDef: (season: number, force = false) =>
    loadCsv(`${BASE}/pfr_advstats/advstats_week_def_${season}.csv`, `advdef_${season}`, 6 * HOUR, force),
  /** Season-aggregated QB stats including pressure_pct — used as the O-line pass-block proxy for completed seasons. */
  advSeasonPass: (force = false) =>
    loadCsv(`${BASE}/pfr_advstats/advstats_season_pass.csv`, 'advpass_season', 6 * HOUR, force),
  /** Per-game QB pressure stats. The season-level file above lags behind for the in-progress season; this doesn't. */
  advWeekPass: (season: number, force = false) =>
    loadCsv(`${BASE}/pfr_advstats/advstats_week_pass_${season}.csv`, `advpass_week_${season}`, 6 * HOUR, force),
  advSeasonRush: (force = false) =>
    loadCsv(`${BASE}/pfr_advstats/advstats_season_rush.csv`, 'advrush_season', 6 * HOUR, force),
  /** Official weekly injury reports (practice participation + game status), keyed by gsis_id. Updates through
   * the week as new practice reports come in, so this uses a shorter TTL than most other datasets here. */
  injuries: (season: number, force = false) =>
    loadCsv(`${BASE}/injuries/injuries_${season}.csv`, `injuries_${season}`, 2 * HOUR, force),
};

export function clearMemCache(): void {
  memCache.clear();
  playerStatsCache = null;
}

export function currentSeason(): number {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  // The NFL season is named for the year it kicks off in; Jan/Feb games still
  // belong to the previous season's playoffs.
  return month >= 3 ? year : year - 1;
}

export function currentWeek(games: CsvRow[], season: number): number {
  const seasonGames = games.filter((g) => Number(g.season) === season && g.game_type === 'REG');
  if (seasonGames.length === 0) return 1;
  const unplayed = seasonGames.filter((g) => !g.away_score && !g.home_score);
  if (unplayed.length > 0) {
    return Math.min(...unplayed.map((g) => Number(g.week)));
  }
  return Math.max(...seasonGames.map((g) => Number(g.week)));
}

export interface OpponentInfo {
  opponent: string;
  homeAway: 'home' | 'away';
  game: CsvRow;
}

export function opponentFor(games: CsvRow[], season: number, week: number, team: string): OpponentInfo | null {
  const g = games.find(
    (row) =>
      Number(row.season) === season &&
      Number(row.week) === week &&
      (row.home_team === team || row.away_team === team),
  );
  if (!g) return null;
  const isHome = g.home_team === team;
  return { opponent: isHome ? g.away_team : g.home_team, homeAway: isHome ? 'home' : 'away', game: g };
}

export function allTeamsForSeason(games: CsvRow[], season: number): string[] {
  const teams = new Set<string>();
  for (const g of games) {
    if (Number(g.season) !== season) continue;
    teams.add(g.home_team);
    teams.add(g.away_team);
  }
  return [...teams].sort();
}
