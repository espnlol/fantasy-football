import type { PlayerCandidate } from './types';

const KEY = 'fourth-quarter:roster:v1';

export function loadRoster(): PlayerCandidate[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRoster(players: PlayerCandidate[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(players));
  } catch {
    // Private browsing / storage disabled — the roster just won't persist across reloads.
  }
}
