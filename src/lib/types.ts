export type Lean = 'Strong Start' | 'Start' | 'Flex' | 'Bench' | 'Avoid';

export interface ScoreComponent {
  label: string;
  percentile: number;
  weight: number;
  detail: string;
  sampleSize?: number;
}

export interface CompositeResult {
  lean: Lean;
  score: number;
  components: ScoreComponent[];
}

export interface PlayerCandidate {
  gsisId: string;
  name: string;
  position: string;
  team: string;
  status: string;
  headshot: string | null;
  espnId: string | null;
}

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

export interface HistorySummary {
  games: number;
  avgPpr: number;
  totalTd: number;
}

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
  percentileAgainstPosition: number;
  tier: string;
}

export interface RecentForm {
  games: number;
  pprPointsPerGame: number;
}

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
  passerRatingAllowed: number | null;
}

export interface OlineTier {
  team: string;
  season: number;
  pressurePctAllowed: number | null;
  percentile: number;
  tier: string;
  qbSampleAttempts: number;
  qbNames: string[];
}

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
  pressureRatePct: number | null;
  vsTierBreakdown: Record<string, TierBucket>;
}

export interface RusherVsMyTier {
  name: string;
  seasonPressureRatePct: number | null;
  vsThisTier: TierBucket | null;
}

export interface QbSection {
  name: string;
  vsThisDefense: HistorySummary;
  games: GameLine[];
}

export interface DcInfo {
  name: string | null;
  asOf: string;
  confidence: string;
}

interface MatchupBase {
  player: PlayerCandidate;
  opponent: string;
  season: number;
  week: number;
  homeAway: 'home' | 'away';
  ownHistoryVsOpponent: { summary: HistorySummary; games: GameLine[] };
  qb: QbSection | null;
  defensiveCoordinator: DcInfo;
  recommendation: CompositeResult;
}

export interface WrMatchup extends MatchupBase {
  position: 'WR';
  opponentPassDefenseAllowedToWr: { thisSeason: AllowedSplit | null; lastSeason: AllowedSplit | null; recentForm: RecentForm | null };
  opponentCornerbacks: CoverageSummary[];
}

export interface RbMatchup extends MatchupBase {
  position: 'RB';
  opponentRunDefenseAllowedToRb: { thisSeason: AllowedSplit | null; lastSeason: AllowedSplit | null; recentForm: RecentForm | null };
  myOline: { thisSeason: OlineTier | null; lastSeason: OlineTier | null };
  opponentPassRush: { topRushers: PassRusherSummary[]; rushersVsMyTier: RusherVsMyTier[] };
}

export interface ByeResult {
  player: PlayerCandidate;
  season: number;
  week: number;
  bye: true;
}

export type MatchupResult = WrMatchup | RbMatchup | ByeResult;

export interface MetaResponse {
  season: number;
  week: number;
  generatedAt: string;
  coordinators: { asOf: string; confidence: string; note: string };
  playerCount: number;
}
