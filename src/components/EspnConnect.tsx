import { useState } from 'react';
import { api } from '../lib/api';
import type { PlayerCandidate } from '../lib/types';
import { Card, Spinner } from './ui';

export function EspnConnect({ season, onImport }: { season: number; onImport: (players: PlayerCandidate[]) => void }) {
  const [open, setOpen] = useState(false);
  const [leagueId, setLeagueId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [espnS2, setEspnS2] = useState('');
  const [swid, setSwid] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function handleImport() {
    setLoading(true);
    setError(null);
    setNote(null);
    try {
      const { roster } = await api.espnRoster({
        leagueId,
        teamId: Number(teamId),
        season,
        espnS2: espnS2 || undefined,
        swid: swid || undefined,
      });
      const resolved: PlayerCandidate[] = [];
      const missed: string[] = [];
      for (const p of roster) {
        try {
          const { player } = await api.playerByEspnId(p.espnId);
          resolved.push(player);
        } catch {
          missed.push(p.fullName);
        }
      }
      if (resolved.length > 0) onImport(resolved);
      if (missed.length > 0) {
        setNote(`Imported ${resolved.length} player(s). Couldn't match to a current roster: ${missed.join(', ')}.`);
      } else if (resolved.length === 0) {
        setError('No players from that team could be matched to current NFL rosters.');
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
          <h3 className="font-semibold text-slate-900 dark:text-slate-50">Connect your ESPN league</h3>
          <p className="text-xs text-slate-500">Optional — import your roster instead of adding players by hand.</p>
        </div>
        <span className="shrink-0 text-lg text-slate-400">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="mt-4 space-y-3">
          <p className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            ESPN's API is undocumented, and this integration couldn't be exercised against a live league from the
            environment this was built in (its network policy blocks espn.com). It follows the shape the fantasy
            community has reverse-engineered, but treat it as unverified until you've tried it against your own
            league — manual search above always works as a fallback.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-500">
              League ID
              <input
                value={leagueId}
                onChange={(e) => setLeagueId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
            <label className="text-xs text-slate-500">
              Your team ID
              <input
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </label>
          </div>
          <details className="text-xs text-slate-500">
            <summary className="cursor-pointer select-none">Private league? Add your session cookies</summary>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <label className="text-xs text-slate-500">
                espn_s2
                <input
                  value={espnS2}
                  onChange={(e) => setEspnS2(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </label>
              <label className="text-xs text-slate-500">
                SWID
                <input
                  value={swid}
                  onChange={(e) => setSwid(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </label>
            </div>
          </details>
          <button
            onClick={handleImport}
            disabled={loading || !leagueId || !teamId}
            className="flex items-center gap-2 rounded-xl bg-field-600 px-4 py-2 text-sm font-medium text-white hover:bg-field-700 disabled:opacity-50"
          >
            {loading && <Spinner className="border-white/40 border-t-white" />}
            Import roster
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {note && <p className="text-sm text-amber-700 dark:text-amber-300">{note}</p>}
        </div>
      )}
    </Card>
  );
}
