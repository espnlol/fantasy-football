import { useState } from 'react';
import { api } from '../lib/api';
import type { PlayerCandidate } from '../lib/types';
import { Card, Spinner } from './ui';

interface SleeperLeague {
  league_id: string;
  name: string;
}

interface SleeperRoster {
  owner_id: string | null;
  players: string[] | null;
}

const SLEEPER_BASE = 'https://api.sleeper.app/v1';

async function sleeperJson<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SLEEPER_BASE}${path}`);
  } catch {
    throw new Error("Couldn't reach Sleeper — check your connection and try again.");
  }
  if (!res.ok) throw new Error(`Sleeper request failed (HTTP ${res.status}).`);
  const body = (await res.json()) as T | null;
  if (body === null) throw new Error("Sleeper didn't recognize that — double-check the spelling.");
  return body;
}

export function SleeperConnect({ season, onImport }: { season: number; onImport: (players: PlayerCandidate[]) => void }) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<SleeperLeague[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function handleFindLeagues() {
    setLoading(true);
    setError(null);
    setNote(null);
    setLeagues(null);
    try {
      const user = await sleeperJson<{ user_id: string }>(`/user/${encodeURIComponent(username.trim())}`);
      const found = await sleeperJson<SleeperLeague[]>(`/user/${user.user_id}/leagues/nfl/${season}`);
      if (found.length === 0) {
        setError(`No ${season} Sleeper leagues found for "${username.trim()}".`);
        return;
      }
      setUserId(user.user_id);
      setLeagues(found);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleImportLeague(leagueId: string) {
    if (!userId) return;
    setLoading(true);
    setError(null);
    setNote(null);
    try {
      const [rosters, crosswalk, allPlayers] = await Promise.all([
        sleeperJson<SleeperRoster[]>(`/league/${leagueId}/rosters`),
        api.sleeperIndex(),
        api.allPlayers(),
      ]);
      const mine = rosters.find((r) => r.owner_id === userId);
      if (!mine || !mine.players || mine.players.length === 0) {
        setError("Couldn't find your roster in that league.");
        return;
      }

      const byGsis = new Map(allPlayers.map((p) => [p.gsisId, p]));
      const resolved: PlayerCandidate[] = [];
      let missed = 0;
      for (const sleeperId of mine.players) {
        const gsisId = crosswalk[sleeperId];
        const player = gsisId ? byGsis.get(gsisId) : undefined;
        if (player) resolved.push(player);
        else missed++;
      }

      if (resolved.length > 0) onImport(resolved);
      if (resolved.length === 0) {
        setError('No WR/RB on that roster could be matched to current data.');
      } else if (missed > 0) {
        setNote(`Imported ${resolved.length} WR/RB. ${missed} other roster spot(s) — QBs, TEs, K/DEF, or an unmatched player — weren't added.`);
        setLeagues(null);
        setUsername('');
      } else {
        setLeagues(null);
        setUsername('');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-5">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 text-left">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-50">Import from Sleeper</h3>
          <p className="text-xs text-slate-500">Optional — pull your roster by username instead of adding players by hand.</p>
        </div>
        <span className="shrink-0 text-lg text-slate-400">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-3">
          {!leagues && (
            <div className="flex gap-2">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFindLeagues()}
                placeholder="Sleeper username"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
              <button
                onClick={handleFindLeagues}
                disabled={loading || !username.trim()}
                className="flex shrink-0 items-center gap-2 rounded-xl bg-field-600 px-4 py-2 text-sm font-medium text-white hover:bg-field-700 disabled:opacity-50"
              >
                {loading && <Spinner className="border-white/40 border-t-white" />}
                Find leagues
              </button>
            </div>
          )}
          {leagues && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">Pick a league:</p>
              {leagues.map((l) => (
                <button
                  key={l.league_id}
                  onClick={() => handleImportLeague(l.league_id)}
                  disabled={loading}
                  className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  {loading && <Spinner />}
                  {l.name}
                </button>
              ))}
              <button
                onClick={() => {
                  setLeagues(null);
                  setError(null);
                }}
                className="text-xs text-slate-400 hover:underline"
              >
                Back
              </button>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {note && <p className="text-sm text-amber-700 dark:text-amber-300">{note}</p>}
        </div>
      )}
    </Card>
  );
}
