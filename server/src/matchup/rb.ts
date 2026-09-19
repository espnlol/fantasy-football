import { getStartingQb } from '../lib/players';
import { normalizeTeam } from '../lib/teams';
import { currentSeason } from '../lib/datasets';
import { playerVsOpponentHistory, summarizeHistory, GameLine, HistorySummary } from './history';
import { allowedSplitForTeam, recentAllowed, AllowedSplit } from './opponentAllowed';
import { oLineTierForTeam, OlineTier } from './oline';
import { passRushProductionForTeam, PassRusherSummary, TierBucket } from './passRush';
import { getDefensiveCoordinator, DcInfo } from './coordinators';
import { compositeLean, CompositeResult, ScoreComponent } from './util';

export interface QbSection {
  name: string;
  vsThisDefense: HistorySummary;
  games: GameLine[];
}

export interface RusherVsMyTier {
  name: string;
  seasonPressureRatePct: number | null;
  vsThisTier: TierBucket | null;
}

export interface RbMatchupReport {
  opponent: string;
  season: number;
  week: number;
  ownHistoryVsOpponent: { summary: HistorySummary; games: GameLine[] };
  opponentRunDefenseAllowedToRb: {
    thisSeason: AllowedSplit | null;
    lastSeason: AllowedSplit | null;
    recentForm: { games: number; pprPointsPerGame: number } | null;
  };
  myOline: { thisSeason: OlineTier | null; lastSeason: OlineTier | null };
  opponentPassRush: { topRushers: PassRusherSummary[]; rushersVsMyTier: RusherVsMyTier[] };
  qb: QbSection | null;
  defensiveCoordinator: DcInfo;
  recommendation: CompositeResult;
}

export async function analyzeRb(
  gsisId: string,
  playerName: string,
  team: string,
  opponent: string,
  season: number = currentSeason(),
  week?: number,
): Promise<RbMatchupReport> {
  const opp = normalizeTeam(opponent);
  const myTeam = normalizeTeam(team);
  const prevSeason = season - 1;

  const [ownGames, thisSeasonAllowed, lastSeasonAllowed, recentForm, oline, olineLast, rushers, qb] =
    await Promise.all([
      playerVsOpponentHistory(gsisId, opp),
      allowedSplitForTeam(opp, season, 'RB'),
      allowedSplitForTeam(opp, prevSeason, 'RB'),
      recentAllowed(opp, season, 'RB', 4),
      oLineTierForTeam(myTeam, season),
      oLineTierForTeam(myTeam, prevSeason),
      passRushProductionForTeam(opp, season),
      getStartingQb(team, season),
    ]);

  let qbSection: QbSection | null = null;
  if (qb) {
    const qbGames = await playerVsOpponentHistory(qb.gsisId, opp);
    qbSection = { name: qb.name, vsThisDefense: summarizeHistory(qbGames), games: qbGames };
  }

  const dc = getDefensiveCoordinator(opp);
  const ownSummary = summarizeHistory(ownGames);
  const topRushers = rushers.slice(0, 4);
  const myTier = oline?.tier ?? 'Average';
  const rushersVsMyTier: RusherVsMyTier[] = topRushers.map((r) => ({
    name: r.name,
    seasonPressureRatePct: r.pressureRatePct,
    vsThisTier: r.vsTierBreakdown[myTier] ?? null,
  }));

  const components: ScoreComponent[] = [];
  if (thisSeasonAllowed) {
    components.push({
      label: `${opp} run defense vs RB — this season`,
      percentile: thisSeasonAllowed.percentileAgainstPosition,
      weight: 3,
      detail: `${thisSeasonAllowed.perGame.pprPoints} PPR pts/gm allowed to RBs (${thisSeasonAllowed.tier}), ${thisSeasonAllowed.perGame.rushYards} rush yd/gm, over ${thisSeasonAllowed.games} game(s)`,
      sampleSize: thisSeasonAllowed.games,
    });
  }
  if (lastSeasonAllowed) {
    components.push({
      label: `${opp} run defense vs RB — last season`,
      percentile: lastSeasonAllowed.percentileAgainstPosition,
      weight: thisSeasonAllowed && thisSeasonAllowed.games >= 5 ? 1 : 2,
      detail: `${lastSeasonAllowed.perGame.pprPoints} PPR pts/gm allowed to RBs (${lastSeasonAllowed.tier}), full season`,
      sampleSize: lastSeasonAllowed.games,
    });
  }
  if (oline) {
    components.push({
      label: `${myTeam} O-line pass protection — this season`,
      percentile: oline.percentile,
      weight: 2,
      detail: `${oline.pressurePctAllowed ?? '—'}% pressure rate allowed (${oline.tier}), proxied from QB pressure stats over ${oline.qbSampleAttempts} dropbacks`,
      sampleSize: oline.qbSampleAttempts,
    });
  }
  if (ownSummary.games > 0) {
    const pct = Math.max(0, Math.min(100, 50 + (ownSummary.avgPpr - 12) * 4));
    components.push({
      label: `${playerName} vs ${opp} — career`,
      percentile: pct,
      weight: 2,
      detail: `${ownSummary.avgPpr} PPR pts/gm across ${ownSummary.games} career game(s) vs ${opp}, ${ownSummary.totalTd} total TD`,
      sampleSize: ownSummary.games,
    });
  }
  if (topRushers.length > 0) {
    const rated = topRushers.filter((r) => r.pressureRatePct !== null);
    if (rated.length > 0) {
      const avgRate = rated.reduce((s, r) => s + (r.pressureRatePct ?? 0), 0) / rated.length;
      const pct = Math.max(0, Math.min(100, 100 - avgRate * 4));
      components.push({
        label: `${opp} pass rush production — this season`,
        percentile: pct,
        weight: 1.5,
        detail: `Top ${rated.length} rusher(s) average ${Math.round(avgRate * 10) / 10}% pressure rate this season (see breakdown vs ${myTier}-tier O-lines)`,
      });
    }
  }
  if (qbSection && qbSection.vsThisDefense.games > 0) {
    const pct = Math.max(0, Math.min(100, 50 + (qbSection.vsThisDefense.avgPpr - 18) * 2.5));
    components.push({
      label: `${qbSection.name} vs ${opp} defense — career`,
      percentile: pct,
      weight: 1,
      detail: `${qbSection.vsThisDefense.avgPpr} fantasy pts/gm across ${qbSection.vsThisDefense.games} career game(s) vs ${opp}${
        dc.name ? ` (current DC: ${dc.name}, unverified)` : ''
      } — context for game script`,
      sampleSize: qbSection.vsThisDefense.games,
    });
  }

  return {
    opponent: opp,
    season,
    week: week ?? 0,
    ownHistoryVsOpponent: { summary: ownSummary, games: ownGames },
    opponentRunDefenseAllowedToRb: { thisSeason: thisSeasonAllowed, lastSeason: lastSeasonAllowed, recentForm },
    myOline: { thisSeason: oline, lastSeason: olineLast },
    opponentPassRush: { topRushers, rushersVsMyTier },
    qb: qbSection,
    defensiveCoordinator: dc,
    recommendation: compositeLean(components),
  };
}
