import type { PlayerCandidate, MatchupResult, MetaResponse } from './types';

/**
 * This is a fully static site — there's no backend. Everything under public/data/ is precomputed by
 * pipeline/generate-data.ts (run locally, or by the GitHub Actions workflow on a schedule) and just served as
 * plain files. import.meta.env.BASE_URL reflects Vite's `base` config, so this resolves correctly both in local
 * dev (served from /) and on GitHub Pages (served from /fantasy-football/).
 */
const DATA_BASE = `${import.meta.env.BASE_URL}data`;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? "No precomputed data for this — it may not be on an active NFL roster, or data hasn't been generated yet."
        : `Failed to load ${url} (HTTP ${res.status}).`,
    );
  }
  return res.json() as Promise<T>;
}

let playersIndexPromise: Promise<PlayerCandidate[]> | null = null;
function loadPlayersIndex(): Promise<PlayerCandidate[]> {
  if (!playersIndexPromise) {
    playersIndexPromise = getJson<PlayerCandidate[]>(`${DATA_BASE}/players.json`);
  }
  return playersIndexPromise;
}

export const api = {
  meta: () => getJson<MetaResponse>(`${DATA_BASE}/meta.json`),

  searchPlayers: async (q: string): Promise<{ results: PlayerCandidate[] }> => {
    const query = q.trim().toLowerCase();
    if (query.length < 2) return { results: [] };
    const all = await loadPlayersIndex();
    const results = all
      .filter((p) => p.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.toLowerCase().indexOf(query) - b.name.toLowerCase().indexOf(query) || a.name.localeCompare(b.name))
      .slice(0, 25);
    return { results };
  },

  matchup: (gsisId: string) => getJson<MatchupResult>(`${DATA_BASE}/matchups/${gsisId}.json`),
};
