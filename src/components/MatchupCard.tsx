import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type {
  GameLine,
  InjuryStatus,
  MatchupResult,
  PlayerCandidate,
  QbMatchup,
  RbMatchup,
  ScoreComponent,
  TeMatchup,
  UsageTrend,
  WrMatchup,
} from '../lib/types';
import { Card, LeanBadge, PercentileBar, SectionLabel, Spinner } from './ui';

const SUPPORTED_POSITIONS = ['WR', 'RB', 'QB', 'TE'];

function ComponentRow({ c }: { c: ScoreComponent }) {
  return (
    <div className="space-y-1 py-2.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-200">{c.label}</span>
        <span className="shrink-0 text-xs text-slate-400">weight ×{c.weight}</span>
      </div>
      <PercentileBar value={c.percentile} />
      <p className="text-xs text-slate-500 dark:text-slate-400">{c.detail}</p>
    </div>
  );
}

function HistoryTable({ games }: { games: GameLine[] }) {
  if (games.length === 0) return <p className="text-sm text-slate-500">No games played against this opponent yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-slate-400">
          <tr>
            <th className="py-1 pr-3 font-medium">Season</th>
            <th className="py-1 pr-3 font-medium">Wk</th>
            <th className="py-1 pr-3 font-medium">Receiving</th>
            <th className="py-1 pr-3 font-medium">Rushing</th>
            <th className="py-1 pr-3 font-medium">Passing</th>
            <th className="py-1 pr-3 font-medium">TD</th>
            <th className="py-1 pr-3 font-medium">Pts</th>
          </tr>
        </thead>
        <tbody>
          {games.map((g, i) => (
            <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
              <td className="py-1.5 pr-3">{g.season}</td>
              <td className="py-1.5 pr-3">{g.week}</td>
              <td className="py-1.5 pr-3">
                {g.statline.targets > 0 ? `${g.statline.receptions}/${g.statline.targets}, ${g.statline.recYards} yd` : '—'}
              </td>
              <td className="py-1.5 pr-3">
                {g.statline.carries > 0 ? `${g.statline.carries} car, ${g.statline.rushYards} yd` : '—'}
              </td>
              <td className="py-1.5 pr-3">{g.statline.passYards > 0 ? `${g.statline.passYards} yd, ${g.statline.passTd} TD, ${g.statline.interceptions} INT` : '—'}</td>
              <td className="py-1.5 pr-3">{g.statline.recTd + g.statline.rushTd + g.statline.passTd}</td>
              <td className="py-1.5 pr-3 font-semibold text-slate-700 dark:text-slate-200">{g.pprPoints.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('');
}

function PlayerAvatar({ player }: { player: PlayerCandidate }) {
  const [failed, setFailed] = useState(false);
  if (!player.headshot || failed) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-400 dark:bg-slate-800">
        {initials(player.name)}
      </div>
    );
  }
  return (
    <img
      src={player.headshot}
      alt=""
      onError={() => setFailed(true)}
      className="h-12 w-12 shrink-0 rounded-full bg-slate-100 object-cover dark:bg-slate-800"
    />
  );
}

const INJURY_STYLES: Record<string, string> = {
  Out: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/30 dark:border-red-800 dark:text-red-200',
  Doubtful: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/30 dark:border-red-800 dark:text-red-200',
  Questionable: 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/30 dark:border-amber-800 dark:text-amber-200',
};

function InjuryBanner({ injury }: { injury: InjuryStatus | null }) {
  if (!injury || injury.status === 'Healthy') return null;
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm font-medium ${INJURY_STYLES[injury.status] ?? INJURY_STYLES.Questionable}`}>
      {injury.status}
      {injury.primaryInjury ? ` — ${injury.primaryInjury}` : ''}
      <span className="ml-1.5 font-normal opacity-80">(week {injury.asOfWeek} injury report)</span>
    </div>
  );
}

function UsageTrendTag({ trend }: { trend: UsageTrend | null }) {
  if (!trend || trend.totalGames < 3) return null;
  const arrow = trend.trend === 'up' ? '↑' : trend.trend === 'down' ? '↓' : '→';
  const color =
    trend.trend === 'up'
      ? 'text-field-700 dark:text-field-400'
      : trend.trend === 'down'
        ? 'text-red-600 dark:text-red-400'
        : 'text-slate-500';
  return (
    <span
      className={`text-xs font-medium ${color}`}
      title={`Snap share: ${trend.recentAvgSnapPct}% over last ${trend.recentGames} gm vs ${trend.seasonAvgSnapPct}% season avg`}
    >
      {arrow} usage
    </span>
  );
}

export function MatchupCard({ player, onRemove }: { player: PlayerCandidate; onRemove: () => void }) {
  const [data, setData] = useState<MatchupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    api
      .matchup(player.gsisId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [player.gsisId]);

  const isBye = data && 'bye' in data && data.bye;
  const supported = SUPPORTED_POSITIONS.includes(player.position);

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <PlayerAvatar player={player} />
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900 dark:text-slate-50">{player.name}</h3>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {player.position}
              </span>
            </div>
            <p className="text-sm text-slate-500">{player.team}</p>
          </div>
        </div>
        <button onClick={onRemove} className="shrink-0 text-xs text-slate-400 hover:text-red-500">
          Remove
        </button>
      </div>

      <div className="mt-4">
        {!supported && (
          <p className="text-sm text-slate-500">
            Matchup analysis covers WR, RB, QB, and TE — {player.position} isn't supported yet.
          </p>
        )}
        {supported && loading && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Spinner /> Loading matchup…
          </div>
        )}
        {supported && error && <p className="text-sm text-red-600">{error}</p>}
        {supported && isBye && <p className="text-sm text-slate-500">Bye week {data!.week} — no game.</p>}
        {supported && data && !isBye && (
          <MatchupBody data={data as WrMatchup | RbMatchup | QbMatchup | TeMatchup} expanded={expanded} setExpanded={setExpanded} />
        )}
      </div>
    </Card>
  );
}

function MatchupBody({
  data,
  expanded,
  setExpanded,
}: {
  data: WrMatchup | RbMatchup | QbMatchup | TeMatchup;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <span>
            Week {data.week} · {data.homeAway === 'home' ? 'vs' : '@'} <span className="font-semibold">{data.opponent}</span>
          </span>
          <UsageTrendTag trend={data.usageTrend} />
        </p>
        <LeanBadge lean={data.recommendation.lean} score={data.recommendation.score} />
      </div>

      <InjuryBanner injury={data.injuryStatus} />

      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs font-medium text-field-700 hover:underline dark:text-field-400"
      >
        {expanded ? 'Hide full breakdown ▲' : 'Show full breakdown ▼'}
      </button>

      {expanded && (
        <div className="space-y-5 border-t border-slate-100 pt-4 dark:border-slate-800">
          <div>
            <SectionLabel>Why this lean</SectionLabel>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.recommendation.components.map((c, i) => (
                <ComponentRow key={i} c={c} />
              ))}
            </div>
          </div>

          <div>
            <SectionLabel>
              {data.player.name} vs {data.opponent} — career
            </SectionLabel>
            <HistoryTable games={data.ownHistoryVsOpponent.games} />
          </div>

          {data.position === 'WR' && <WrExtras data={data} />}
          {data.position === 'RB' && <RbExtras data={data} />}
          {data.position === 'QB' && <QbExtras data={data} />}
          {data.position === 'TE' && <TeExtras data={data} />}

          {data.position !== 'QB' && data.qb && (
            <div>
              <SectionLabel>
                QB context — {data.qb.name} vs {data.opponent}
              </SectionLabel>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {data.qb.vsThisDefense.games > 0
                  ? `${data.qb.vsThisDefense.avgPpr} fantasy pts/gm across ${data.qb.vsThisDefense.games} career game(s) vs this defense.`
                  : 'No career games against this defense yet.'}
              </p>
              {data.defensiveCoordinator.name && (
                <p className="mt-0.5 text-xs text-slate-400">
                  Current DC: {data.defensiveCoordinator.name} — unverified, see Methodology.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WrExtras({ data }: { data: WrMatchup }) {
  const { thisSeason, lastSeason, recentForm } = data.opponentPassDefenseAllowedToWr;
  return (
    <>
      <div>
        <SectionLabel>{data.opponent} pass defense vs WR</SectionLabel>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {thisSeason
            ? `This season: ${thisSeason.perGame.pprPoints} PPR pts/gm allowed (${thisSeason.tier}, n=${thisSeason.games} gm).`
            : 'No data yet this season.'}{' '}
          {lastSeason && `Last season: ${lastSeason.perGame.pprPoints} pts/gm (${lastSeason.tier}).`}{' '}
          {recentForm && `Last ${recentForm.games} gm: ${recentForm.pprPointsPerGame} pts/gm.`}
        </p>
      </div>
      <div>
        <SectionLabel>{data.opponent}'s cornerbacks — coverage this season</SectionLabel>
        {data.opponentCornerbacks.length === 0 ? (
          <p className="text-sm text-slate-500">No coverage data yet this season.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="py-1 pr-3 font-medium">Corner</th>
                  <th className="py-1 pr-3 font-medium">Tgt</th>
                  <th className="py-1 pr-3 font-medium">Comp%</th>
                  <th className="py-1 pr-3 font-medium">Yd/Tgt</th>
                  <th className="py-1 pr-3 font-medium">TD</th>
                  <th className="py-1 pr-3 font-medium">Rating allowed</th>
                </tr>
              </thead>
              <tbody>
                {data.opponentCornerbacks.map((c) => (
                  <tr key={c.pfrPlayerId} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1.5 pr-3 font-medium">{c.name}</td>
                    <td className="py-1.5 pr-3">{c.targets}</td>
                    <td className="py-1.5 pr-3">{c.completionPctAllowed ?? '—'}%</td>
                    <td className="py-1.5 pr-3">{c.yardsPerTargetAllowed ?? '—'}</td>
                    <td className="py-1.5 pr-3">{c.tdAllowed}</td>
                    <td className="py-1.5 pr-3">{c.passerRatingAllowed ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-1.5 text-xs text-slate-400">
          Season-long coverage tendencies for this team's most-used corners (by defensive snaps) — not a
          play-by-play "who covered whom," which isn't public data. See Methodology.
        </p>
      </div>
    </>
  );
}

function RbExtras({ data }: { data: RbMatchup }) {
  const { thisSeason, lastSeason, recentForm } = data.opponentRunDefenseAllowedToRb;
  const { thisSeason: olineNow, lastSeason: olineLast } = data.myOline;
  const tierNow = olineNow?.tier ?? 'Average';

  return (
    <>
      <div>
        <SectionLabel>{data.opponent} run defense vs RB</SectionLabel>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {thisSeason
            ? `This season: ${thisSeason.perGame.pprPoints} PPR pts/gm allowed (${thisSeason.tier}, n=${thisSeason.games} gm).`
            : 'No data yet this season.'}{' '}
          {lastSeason && `Last season: ${lastSeason.perGame.pprPoints} pts/gm (${lastSeason.tier}).`}{' '}
          {recentForm && `Last ${recentForm.games} gm: ${recentForm.pprPointsPerGame} pts/gm.`}
        </p>
      </div>
      <div>
        <SectionLabel>{data.player.team} O-line pass protection</SectionLabel>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {olineNow
            ? `This season: ${olineNow.pressurePctAllowed}% pressure rate allowed (${olineNow.tier}).`
            : 'No data yet.'}{' '}
          {olineLast && `Last season: ${olineLast.pressurePctAllowed}% (${olineLast.tier}).`}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Proxied from the team's own QB pressure rate — there's no free per-lineman grade (that's PFF's paywalled
          product). See Methodology.
        </p>
      </div>
      <div>
        <SectionLabel>{data.opponent}'s pass rush this season</SectionLabel>
        {data.opponentPassRush.topRushers.length === 0 ? (
          <p className="text-sm text-slate-500">No data yet this season.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="py-1 pr-3 font-medium">Rusher</th>
                  <th className="py-1 pr-3 font-medium">Pressure events</th>
                  <th className="py-1 pr-3 font-medium">Sacks</th>
                  <th className="py-1 pr-3 font-medium">Season rate</th>
                  <th className="py-1 pr-3 font-medium">vs {tierNow}-tier O-lines</th>
                </tr>
              </thead>
              <tbody>
                {data.opponentPassRush.topRushers.map((t) => {
                  const vsTier = data.opponentPassRush.rushersVsMyTier.find((r) => r.name === t.name)?.vsThisTier;
                  return (
                    <tr key={t.pfrPlayerId} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="py-1.5 pr-3 font-medium">{t.name}</td>
                      <td className="py-1.5 pr-3">{t.totalPressureEvents}</td>
                      <td className="py-1.5 pr-3">{t.totalSacks}</td>
                      <td className="py-1.5 pr-3">{t.pressureRatePct ?? '—'}%</td>
                      <td className="py-1.5 pr-3">{vsTier ? `${vsTier.ratePct ?? '—'}% (n=${vsTier.games} gm)` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-1.5 text-xs text-slate-400">
          "Pressure events" = pressures + hurries + hits + sacks (PFR via nflverse). The last column is this
          rusher's rate specifically in games against offensive lines rated the same tier as {data.player.team}'s.
        </p>
      </div>
    </>
  );
}

function QbExtras({ data }: { data: QbMatchup }) {
  const { thisSeason, lastSeason, recentForm } = data.opponentPassDefenseAllowedToQb;
  const { thisSeason: olineNow, lastSeason: olineLast } = data.myOline;
  const tierNow = olineNow?.tier ?? 'Average';

  return (
    <>
      <div>
        <SectionLabel>{data.opponent} pass defense vs QB</SectionLabel>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {thisSeason
            ? `This season: ${thisSeason.perGame.pprPoints} fantasy pts/gm allowed to QBs (${thisSeason.tier}), ${thisSeason.perGame.passYards} pass yd/gm, ${thisSeason.perGame.passTd} pass TD/gm, n=${thisSeason.games} gm.`
            : 'No data yet this season.'}{' '}
          {lastSeason && `Last season: ${lastSeason.perGame.pprPoints} pts/gm (${lastSeason.tier}).`}{' '}
          {recentForm && `Last ${recentForm.games} gm: ${recentForm.pprPointsPerGame} pts/gm.`}
        </p>
      </div>
      <div>
        <SectionLabel>{data.player.team} O-line pass protection</SectionLabel>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {olineNow
            ? `This season: ${olineNow.pressurePctAllowed}% pressure rate allowed (${olineNow.tier}).`
            : 'No data yet.'}{' '}
          {olineLast && `Last season: ${olineLast.pressurePctAllowed}% (${olineLast.tier}).`}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Proxied from this QB's own pressure rate — there's no free per-lineman grade (that's PFF's paywalled
          product). See Methodology.
        </p>
      </div>
      <div>
        <SectionLabel>{data.opponent}'s pass rush this season</SectionLabel>
        {data.opponentPassRush.topRushers.length === 0 ? (
          <p className="text-sm text-slate-500">No data yet this season.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="py-1 pr-3 font-medium">Rusher</th>
                  <th className="py-1 pr-3 font-medium">Pressure events</th>
                  <th className="py-1 pr-3 font-medium">Sacks</th>
                  <th className="py-1 pr-3 font-medium">Season rate</th>
                  <th className="py-1 pr-3 font-medium">vs {tierNow}-tier O-lines</th>
                </tr>
              </thead>
              <tbody>
                {data.opponentPassRush.topRushers.map((t) => {
                  const vsTier = data.opponentPassRush.rushersVsMyTier.find((r) => r.name === t.name)?.vsThisTier;
                  return (
                    <tr key={t.pfrPlayerId} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="py-1.5 pr-3 font-medium">{t.name}</td>
                      <td className="py-1.5 pr-3">{t.totalPressureEvents}</td>
                      <td className="py-1.5 pr-3">{t.totalSacks}</td>
                      <td className="py-1.5 pr-3">{t.pressureRatePct ?? '—'}%</td>
                      <td className="py-1.5 pr-3">{vsTier ? `${vsTier.ratePct ?? '—'}% (n=${vsTier.games} gm)` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-1.5 text-xs text-slate-400">
          "Pressure events" = pressures + hurries + hits + sacks (PFR via nflverse) — the pressure this QB faces
          directly.
        </p>
      </div>
    </>
  );
}

function TeExtras({ data }: { data: TeMatchup }) {
  const { thisSeason, lastSeason, recentForm } = data.opponentPassDefenseAllowedToTe;
  return (
    <>
      <div>
        <SectionLabel>{data.opponent} pass defense vs TE</SectionLabel>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {thisSeason
            ? `This season: ${thisSeason.perGame.pprPoints} PPR pts/gm allowed (${thisSeason.tier}, n=${thisSeason.games} gm).`
            : 'No data yet this season.'}{' '}
          {lastSeason && `Last season: ${lastSeason.perGame.pprPoints} pts/gm (${lastSeason.tier}).`}{' '}
          {recentForm && `Last ${recentForm.games} gm: ${recentForm.pprPointsPerGame} pts/gm.`}
        </p>
      </div>
      <div>
        <SectionLabel>{data.opponent}'s coverage linebackers/safeties this season</SectionLabel>
        {data.opponentCoverageDefenders.length === 0 ? (
          <p className="text-sm text-slate-500">No coverage data yet this season.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400">
                <tr>
                  <th className="py-1 pr-3 font-medium">Defender</th>
                  <th className="py-1 pr-3 font-medium">Tgt</th>
                  <th className="py-1 pr-3 font-medium">Comp%</th>
                  <th className="py-1 pr-3 font-medium">Yd/Tgt</th>
                  <th className="py-1 pr-3 font-medium">TD</th>
                  <th className="py-1 pr-3 font-medium">Rating allowed</th>
                </tr>
              </thead>
              <tbody>
                {data.opponentCoverageDefenders.map((c) => (
                  <tr key={c.pfrPlayerId} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1.5 pr-3 font-medium">{c.name}</td>
                    <td className="py-1.5 pr-3">{c.targets}</td>
                    <td className="py-1.5 pr-3">{c.completionPctAllowed ?? '—'}%</td>
                    <td className="py-1.5 pr-3">{c.yardsPerTargetAllowed ?? '—'}</td>
                    <td className="py-1.5 pr-3">{c.tdAllowed}</td>
                    <td className="py-1.5 pr-3">{c.passerRatingAllowed ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-1.5 text-xs text-slate-400">
          Tight ends are usually covered by linebackers and safeties, not boundary corners — this is that group's
          season coverage stats instead of the cornerback table WRs get. Season-long tendencies, not a
          play-by-play "who covered whom." See Methodology.
        </p>
      </div>
    </>
  );
}
