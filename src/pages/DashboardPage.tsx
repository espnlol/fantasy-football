import { useEffect, useState } from 'react';
import type { MetaResponse, PlayerCandidate } from '../lib/types';
import { loadRoster, saveRoster } from '../lib/storage';
import { PlayerSearch } from '../components/PlayerSearch';
import { SleeperConnect } from '../components/SleeperConnect';
import { MatchupCard, type MatchupResultEvent } from '../components/MatchupCard';
import { ComparePanel } from '../components/ComparePanel';
import { Card } from '../components/ui';

export function DashboardPage({ meta }: { meta: MetaResponse | null }) {
  const [roster, setRoster] = useState<PlayerCandidate[]>([]);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, MatchupResultEvent | undefined>>({});

  useEffect(() => {
    setRoster(loadRoster());
  }, []);

  function handleResult(gsisId: string, result: MatchupResultEvent) {
    setResults((prev) => ({ ...prev, [gsisId]: result }));
  }

  function toggleCompare(gsisId: string) {
    setCompareIds((prev) => {
      if (prev.includes(gsisId)) return prev.filter((id) => id !== gsisId);
      if (prev.length >= 2) return prev;
      return [...prev, gsisId];
    });
  }

  function addPlayer(p: PlayerCandidate) {
    setRoster((prev) => {
      if (prev.some((x) => x.gsisId === p.gsisId)) return prev;
      const next = [...prev, p];
      saveRoster(next);
      return next;
    });
  }

  function addPlayers(players: PlayerCandidate[]) {
    setRoster((prev) => {
      const existing = new Set(prev.map((x) => x.gsisId));
      const additions = players.filter((p) => !existing.has(p.gsisId));
      if (additions.length === 0) return prev;
      const next = [...prev, ...additions];
      saveRoster(next);
      return next;
    });
  }

  function removePlayer(gsisId: string) {
    setRoster((prev) => {
      const next = prev.filter((p) => p.gsisId !== gsisId);
      saveRoster(next);
      return next;
    });
    setCompareIds((prev) => prev.filter((id) => id !== gsisId));
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="mb-1 font-semibold text-slate-900 dark:text-slate-50">Your roster</h2>
        <p className="mb-4 text-sm text-slate-500">
          Add the WR, RB, QB, and TE you're deciding between. Saved in this browser only — check "Compare" on any
          two to see them side by side.
        </p>
        <PlayerSearch onAdd={addPlayer} />
      </Card>

      <SleeperConnect season={meta?.season ?? new Date().getFullYear()} onImport={addPlayers} />

      {roster.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          No players yet — search above to add your first one.
        </Card>
      ) : (
        <>
          {compareIds.length === 2 && (
            <ComparePanel
              players={compareIds.map((id) => roster.find((p) => p.gsisId === id)!) as [PlayerCandidate, PlayerCandidate]}
              results={results}
              onClear={() => setCompareIds([])}
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {roster.map((p) => (
              <MatchupCard
                key={p.gsisId}
                player={p}
                onRemove={() => removePlayer(p.gsisId)}
                onResult={handleResult}
                compare={
                  roster.length >= 2
                    ? {
                        checked: compareIds.includes(p.gsisId),
                        disabled: compareIds.length >= 2 && !compareIds.includes(p.gsisId),
                        onToggle: () => toggleCompare(p.gsisId),
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
