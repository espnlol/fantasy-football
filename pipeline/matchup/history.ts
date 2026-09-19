import { Datasets } from '../lib/datasets';
import { num } from '../lib/csv';
import { normalizeTeam } from '../lib/teams';

export interface GameLine {
  season: number;
  week: number;
  opponent: string;
  team: string;
  statline: {
    targets: number;
    receptions: number;
    recYards: number;
    recTd: number;
    carries: number;
    rushYards: number;
    rushTd: number;
    passYards: number;
    passTd: number;
    interceptions: number;
  };
  pprPoints: number;
}

export async function playerVsOpponentHistory(gsisId: string, opponent: string): Promise<GameLine[]> {
  const { rows } = await Datasets.playerStats();
  const opp = normalizeTeam(opponent);
  const games: GameLine[] = [];
  for (const row of rows) {
    if (row.player_id !== gsisId) continue;
    if (row.season_type !== 'REG') continue;
    if (normalizeTeam(row.opponent_team) !== opp) continue;
    games.push({
      season: Number(row.season),
      week: Number(row.week),
      opponent: opp,
      team: normalizeTeam(row.recent_team),
      statline: {
        targets: num(row, 'targets') ?? 0,
        receptions: num(row, 'receptions') ?? 0,
        recYards: num(row, 'receiving_yards') ?? 0,
        recTd: num(row, 'receiving_tds') ?? 0,
        carries: num(row, 'carries') ?? 0,
        rushYards: num(row, 'rushing_yards') ?? 0,
        rushTd: num(row, 'rushing_tds') ?? 0,
        passYards: num(row, 'passing_yards') ?? 0,
        passTd: num(row, 'passing_tds') ?? 0,
        interceptions: num(row, 'interceptions') ?? 0,
      },
      pprPoints: num(row, 'fantasy_points_ppr') ?? 0,
    });
  }
  games.sort((a, b) => b.season - a.season || b.week - a.week);
  return games;
}

export interface HistorySummary {
  games: number;
  avgPpr: number;
  totalTd: number;
}

export function summarizeHistory(games: GameLine[]): HistorySummary {
  if (games.length === 0) return { games: 0, avgPpr: 0, totalTd: 0 };
  const totalPpr = games.reduce((s, g) => s + g.pprPoints, 0);
  const totalTd = games.reduce((s, g) => s + g.statline.recTd + g.statline.rushTd + g.statline.passTd, 0);
  return { games: games.length, avgPpr: Math.round((totalPpr / games.length) * 10) / 10, totalTd };
}
