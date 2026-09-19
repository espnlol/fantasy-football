import { useEffect, useState } from 'react';
import type { PlayerCandidate } from '../lib/types';
import { loadRoster, saveRoster } from '../lib/storage';
import { PlayerSearch } from '../components/PlayerSearch';
import { MatchupCard } from '../components/MatchupCard';
import { Card } from '../components/ui';

export function DashboardPage() {
  const [roster, setRoster] = useState<PlayerCandidate[]>([]);

  useEffect(() => {
    setRoster(loadRoster());
  }, []);

  function addPlayer(p: PlayerCandidate) {
    setRoster((prev) => {
      if (prev.some((x) => x.gsisId === p.gsisId)) return prev;
      const next = [...prev, p];
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
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="mb-1 font-semibold text-slate-900 dark:text-slate-50">Your roster</h2>
        <p className="mb-4 text-sm text-slate-500">
          Add the WRs and RBs you're deciding between. Saved in this browser only.
        </p>
        <PlayerSearch onAdd={addPlayer} />
      </Card>

      {roster.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          No players yet — search above to add your first one.
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {roster.map((p) => (
            <MatchupCard key={p.gsisId} player={p} onRemove={() => removePlayer(p.gsisId)} />
          ))}
        </div>
      )}
    </div>
  );
}
