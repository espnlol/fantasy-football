import { normalizeTeam } from '../lib/teams';
import { currentSeason } from '../lib/datasets';
import { playerVsOpponentHistory, summarizeHistory, GameLine, HistorySummary } from './history';
import { allowedSplitForTeam, recentAllowed, AllowedSplit } from './opponentAllowed';
import { oLineTierForTeam, OlineTier } from './oline';
import { passRushProductionForTeam, PassRusherSummary, TierBucket } from './passRush';
import { getDefensiveCoordinator, DcInfo } from './coordinators';
import { compositeLean, CompositeResult, ScoreComponent } from './util';

export interface RusherVsMyTier {
  name: string;
  seasonPressureRatePct: number | null;
  vsThisTier: TierBucket | null;
}

export interface QbMatchupReport {
  opponent: string;
  season: number;
  week: number;
  ownHistoryVsOpponent: { summary: HistorySummary; games: GameLine[] };
  opponentPassDefenseAllowedToQb: {
    thisSeason: AllowedSplit | null;
    lastSeason: AllowedSplit | null;
    recentForm: { games: number; pprPointsPerGame: number } | null;
  };
  myOline: { thisSeason: OlineTier | null; lastSeason: OlineTier | null };
  opponentPassRush: { topRushers: PassRusherSummary[]; rushersVsMyTier: RusherVsMyTier[] };
  defensiveCoordinator: DcInfo;
  recommendation: CompositeResult;
}

export async function analyzeQb(
  gsisId: string,
  playerName: string,
  team: string,
  opponent: string,
  season: number = currentSeason(),
  week?: number,
): Promise<QbMatchupReport> {
  const opp = normalizeTeam(opponent);
  const myTeam = normalizeTeam(team);
  const prevSeason = season - 1;

  const [ownGames, thisSeasonAllowed, lastSeasonAllowed, recentForm, oline, olineLast, rushers] = await Promise.all([
    playerVsOpponentHistory(gsisId, opp),
    allowedSplitForTeam(opp, season, 'QB'),
    allowedSplitForTeam(opp, prevSeason, 'QB'),
    recentAllowed(opp, season, 'QB', 4),
    oLineTierForTeam(myTeam, season),
    oLineTierForTeam(myTeam, prevSeason),
    passRushProductionForTeam(opp, season),
  ]);

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
      label: `${opp} pass defense vs QB — this season`,
      percentile: thisSeasonAllowed.percentileAgainstPosition,
      weight: 3,
      detail: `${thisSeasonAllowed.perGame.pprPoints} fantasy pts/gm allowed to opposing QBs (${thisSeasonAllowed.tier}), ${thisSeasonAllowed.perGame.passYards} pass yd/gm, ${thisSeasonAllowed.perGame.passTd} pass TD/gm, over ${thisSeasonAllowed.games} game(s)`,
      sampleSize: thisSeasonAllowed.games,
    });
  }
  if (lastSeasonAllowed) {
    components.push({
      label: `${opp} pass defense vs QB — last season`,
      percentile: lastSeasonAllowed.percentileAgainstPosition,
      weight: thisSeasonAllowed && thisSeasonAllowed.games >= 5 ? 1 : 2,
      detail: `${lastSeasonAllowed.perGame.pprPoints} fantasy pts/gm allowed to opposing QBs (${lastSeasonAllowed.tier}), full season`,
      sampleSize: lastSeasonAllowed.games,
    });
  }
  if (oline) {
    components.push({
      label: `${myTeam} O-line pass protection — this season`,
      percentile: oline.percentile,
      weight: 2,
      detail: `${oline.pressurePctAllowed ?? '—'}% pressure rate allowed (${oline.tier}), proxied from this team's own QB pressure stats over ${oline.qbSampleAttempts} dropbacks`,
      sampleSize: oline.qbSampleAttempts,
    });
  }
  if (ownSummary.games > 0) {
    const pct = Math.max(0, Math.min(100, 50 + (ownSummary.avgPpr - 18) * 2.5));
    components.push({
      label: `${playerName} vs ${opp} — career`,
      percentile: pct,
      weight: 2,
      detail: `${ownSummary.avgPpr} fantasy pts/gm across ${ownSummary.games} career game(s) vs ${opp}${
        dc.name ? ` (current DC: ${dc.name}, unverified)` : ''
      }, ${ownSummary.totalTd} total TD`,
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
        weight: 2,
        detail: `Top ${rated.length} rusher(s) average ${Math.round(avgRate * 10) / 10}% pressure rate this season (see breakdown vs ${myTier}-tier O-lines) — the pressure this QB will face directly`,
      });
    }
  }

  return {
    opponent: opp,
    season,
    week: week ?? 0,
    ownHistoryVsOpponent: { summary: ownSummary, games: ownGames },
    opponentPassDefenseAllowedToQb: { thisSeason: thisSeasonAllowed, lastSeason: lastSeasonAllowed, recentForm },
    myOline: { thisSeason: oline, lastSeason: olineLast },
    opponentPassRush: { topRushers, rushersVsMyTier },
    defensiveCoordinator: dc,
    recommendation: compositeLean(components),
  };
}
