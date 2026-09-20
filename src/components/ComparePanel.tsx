import type { MatchupResultEvent } from './MatchupCard';
import type { PlayerCandidate, QbMatchup, RbMatchup, TeMatchup, WrMatchup } from '../lib/types';
import { Card, LeanBadge, Spinner } from './ui';
import { InjuryBanner, MatchupDetails, PlayerAvatar, UsageTrendTag } from './MatchupCard';

type FullMatchup = WrMatchup | RbMatchup | QbMatchup | TeMatchup;

function isFullMatchup(event: MatchupResultEvent | undefined): event is { data: FullMatchup } {
  return !!event && 'data' in event && !('bye' in event.data);
}

function compareSummary(a: { player: PlayerCandidate; data: FullMatchup }, b: { player: PlayerCandidate; data: FullMatchup }): string {
  const aHurt = a.data.injuryStatus?.status === 'Out' || a.data.injuryStatus?.status === 'Doubtful';
  const bHurt = b.data.injuryStatus?.status === 'Out' || b.data.injuryStatus?.status === 'Doubtful';
  if (aHurt && !bHurt) return `${a.player.name} is ${a.data.injuryStatus!.status} — ${b.player.name} is the lean by default.`;
  if (bHurt && !aHurt) return `${b.player.name} is ${b.data.injuryStatus!.status} — ${a.player.name} is the lean by default.`;
  if (aHurt && bHurt) return `Both are hurt enough to override the matchup score below — neither is a confident start this week.`;

  const diff = Math.abs(a.data.recommendation.score - b.data.recommendation.score);
  if (diff < 5) {
    return `Nearly even — ${diff.toFixed(0)} point${diff.toFixed(0) === '1' ? '' : 's'} apart. Lean on roster needs or your own read on the two breakdowns below.`;
  }
  const betterName = a.data.recommendation.score > b.data.recommendation.score ? a.player.name : b.player.name;
  const hi = Math.max(a.data.recommendation.score, b.data.recommendation.score);
  const lo = Math.min(a.data.recommendation.score, b.data.recommendation.score);
  return `${betterName} has the better matchup score this week (${hi.toFixed(0)} vs ${lo.toFixed(0)}) — see why in the breakdowns below.`;
}

function ComparePlayerColumn({ player, result }: { player: PlayerCandidate; result: MatchupResultEvent | undefined }) {
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-center gap-3">
        <PlayerAvatar player={player} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold text-slate-900 dark:text-slate-50">{player.name}</h3>
            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {player.position}
            </span>
          </div>
          <p className="text-sm text-slate-500">{player.team}</p>
        </div>
      </div>

      {!result && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Spinner /> Loading matchup…
        </div>
      )}
      {result && 'error' in result && <p className="text-sm text-red-600">{result.error}</p>}
      {result && 'data' in result && 'bye' in result.data && result.data.bye && (
        <p className="text-sm text-slate-500">Bye week {result.data.week} — no game to compare.</p>
      )}
      {isFullMatchup(result) && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <span>
                Week {result.data.week} · {result.data.homeAway === 'home' ? 'vs' : '@'}{' '}
                <span className="font-semibold">{result.data.opponent}</span>
              </span>
              <UsageTrendTag trend={result.data.usageTrend} />
            </p>
            <LeanBadge lean={result.data.recommendation.lean} score={result.data.recommendation.score} />
          </div>
          <InjuryBanner injury={result.data.injuryStatus} />
          <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
            <MatchupDetails data={result.data} />
          </div>
        </>
      )}
    </div>
  );
}

export function ComparePanel({
  players,
  results,
  onClear,
}: {
  players: [PlayerCandidate, PlayerCandidate];
  results: Record<string, MatchupResultEvent | undefined>;
  onClear: () => void;
}) {
  const [a, b] = players;
  const resA = results[a.gsisId];
  const resB = results[b.gsisId];
  const bothLoaded = isFullMatchup(resA) && isFullMatchup(resB);
  const crossPosition = a.position !== b.position;

  return (
    <Card className="p-5 ring-1 ring-field-500">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-900 dark:text-slate-50">Comparing</h2>
        <button onClick={onClear} className="shrink-0 text-xs text-slate-400 hover:text-red-500">
          Clear comparison
        </button>
      </div>

      {bothLoaded && (
        <p className="mb-1 text-sm text-slate-600 dark:text-slate-300">
          {compareSummary({ player: a, data: resA.data }, { player: b, data: resB.data })}
        </p>
      )}
      {bothLoaded && crossPosition && (
        <p className="mb-4 text-xs text-amber-600 dark:text-amber-400">
          Comparing across positions ({a.position} vs {b.position}) — each score is built from that position's own
          signals, not the same yardstick, so treat this as a rougher read than a same-position comparison.
        </p>
      )}
      {!bothLoaded && <div className="mb-4" />}

      <div className="grid gap-5 sm:grid-cols-2">
        <ComparePlayerColumn player={a} result={resA} />
        <ComparePlayerColumn player={b} result={resB} />
      </div>
    </Card>
  );
}
