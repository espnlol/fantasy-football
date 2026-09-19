import { getStartingQb } from '../lib/players';
import { normalizeTeam } from '../lib/teams';
import { currentSeason } from '../lib/datasets';
import { playerVsOpponentHistory, summarizeHistory, GameLine, HistorySummary } from './history';
import { allowedSplitForTeam, recentAllowed, AllowedSplit } from './opponentAllowed';
import { topLinebackerSafetyCoverage, CoverageSummary } from './coverage';
import { getDefensiveCoordinator, DcInfo } from './coordinators';
import { compositeLean, CompositeResult, ScoreComponent } from './util';

export interface QbSection {
  name: string;
  vsThisDefense: HistorySummary;
  games: GameLine[];
}

export interface TeMatchupReport {
  opponent: string;
  season: number;
  week: number;
  ownHistoryVsOpponent: { summary: HistorySummary; games: GameLine[] };
  opponentPassDefenseAllowedToTe: {
    thisSeason: AllowedSplit | null;
    lastSeason: AllowedSplit | null;
    recentForm: { games: number; pprPointsPerGame: number } | null;
  };
  /** Linebackers and safeties, not corners — TEs are covered by a different position group than WRs. */
  opponentCoverageDefenders: CoverageSummary[];
  qb: QbSection | null;
  defensiveCoordinator: DcInfo;
  recommendation: CompositeResult;
}

export async function analyzeTe(
  gsisId: string,
  playerName: string,
  team: string,
  opponent: string,
  season: number = currentSeason(),
  week?: number,
): Promise<TeMatchupReport> {
  const opp = normalizeTeam(opponent);
  const prevSeason = season - 1;

  const [ownGames, thisSeasonAllowed, lastSeasonAllowed, recentForm, defenders, qb] = await Promise.all([
    playerVsOpponentHistory(gsisId, opp),
    allowedSplitForTeam(opp, season, 'TE'),
    allowedSplitForTeam(opp, prevSeason, 'TE'),
    recentAllowed(opp, season, 'TE', 4),
    topLinebackerSafetyCoverage(opp, season),
    getStartingQb(team, season),
  ]);

  let qbSection: QbSection | null = null;
  if (qb) {
    const qbGames = await playerVsOpponentHistory(qb.gsisId, opp);
    qbSection = { name: qb.name, vsThisDefense: summarizeHistory(qbGames), games: qbGames };
  }

  const dc = getDefensiveCoordinator(opp);
  const ownSummary = summarizeHistory(ownGames);

  const components: ScoreComponent[] = [];
  if (thisSeasonAllowed) {
    components.push({
      label: `${opp} pass defense vs TE — this season`,
      percentile: thisSeasonAllowed.percentileAgainstPosition,
      weight: 3,
      detail: `${thisSeasonAllowed.perGame.pprPoints} PPR pts/gm allowed to TEs (${thisSeasonAllowed.tier}), ${thisSeasonAllowed.perGame.targets} tgt/gm, over ${thisSeasonAllowed.games} game(s)`,
      sampleSize: thisSeasonAllowed.games,
    });
  }
  if (lastSeasonAllowed) {
    components.push({
      label: `${opp} pass defense vs TE — last season`,
      percentile: lastSeasonAllowed.percentileAgainstPosition,
      weight: thisSeasonAllowed && thisSeasonAllowed.games >= 5 ? 1 : 2,
      detail: `${lastSeasonAllowed.perGame.pprPoints} PPR pts/gm allowed to TEs (${lastSeasonAllowed.tier}), full season`,
      sampleSize: lastSeasonAllowed.games,
    });
  }
  if (ownSummary.games > 0) {
    const pct = Math.max(0, Math.min(100, 50 + (ownSummary.avgPpr - 9) * 4));
    components.push({
      label: `${playerName} vs ${opp} — career`,
      percentile: pct,
      weight: 2,
      detail: `${ownSummary.avgPpr} PPR pts/gm across ${ownSummary.games} career game(s) vs ${opp}, ${ownSummary.totalTd} total TD`,
      sampleSize: ownSummary.games,
    });
  }
  if (qbSection && qbSection.vsThisDefense.games > 0) {
    const pct = Math.max(0, Math.min(100, 50 + (qbSection.vsThisDefense.avgPpr - 18) * 2.5));
    components.push({
      label: `${qbSection.name} vs ${opp} defense — career`,
      percentile: pct,
      weight: 1.5,
      detail: `${qbSection.vsThisDefense.avgPpr} fantasy pts/gm across ${qbSection.vsThisDefense.games} career game(s) vs ${opp}${
        dc.name ? ` (current DC: ${dc.name}, unverified)` : ''
      }`,
      sampleSize: qbSection.vsThisDefense.games,
    });
  }

  return {
    opponent: opp,
    season,
    week: week ?? 0,
    ownHistoryVsOpponent: { summary: ownSummary, games: ownGames },
    opponentPassDefenseAllowedToTe: { thisSeason: thisSeasonAllowed, lastSeason: lastSeasonAllowed, recentForm },
    opponentCoverageDefenders: defenders,
    qb: qbSection,
    defensiveCoordinator: dc,
    recommendation: compositeLean(components),
  };
}
