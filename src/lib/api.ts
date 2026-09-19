import type { PlayerCandidate, MatchupResult, MetaResponse, EspnRosterPlayer } from './types';

/**
 * Empty in local dev (Vite's dev-server proxy forwards same-origin /api to the Express server — see
 * vite.config.ts). Set VITE_API_BASE_URL when the frontend and backend are deployed as separate services
 * (e.g. frontend on Vercel, backend on Railway/Render) with no shared origin to proxy through.
 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { error?: string; note?: string });
    const message = [body.error, body.note].filter(Boolean).join(' ') || `Request failed (HTTP ${res.status}).`;
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  meta: () => fetch(`${API_BASE}/api/meta`).then((r) => asJson<MetaResponse>(r)),

  searchPlayers: (q: string) =>
    fetch(`${API_BASE}/api/players/search?q=${encodeURIComponent(q)}`).then((r) => asJson<{ results: PlayerCandidate[] }>(r)),

  playerByEspnId: (espnId: string) =>
    fetch(`${API_BASE}/api/players/by-espn/${encodeURIComponent(espnId)}`).then((r) => asJson<{ player: PlayerCandidate }>(r)),

  matchup: (gsisId: string) => fetch(`${API_BASE}/api/matchup/${gsisId}`).then((r) => asJson<MatchupResult>(r)),

  refresh: () => fetch(`${API_BASE}/api/refresh`, { method: 'POST' }).then((r) => asJson<{ ok: boolean }>(r)),

  espnRoster: (payload: { leagueId: string; season: number; teamId: number; espnS2?: string; swid?: string }) =>
    fetch(`${API_BASE}/api/espn/roster`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => asJson<{ roster: EspnRosterPlayer[] }>(r)),
};
