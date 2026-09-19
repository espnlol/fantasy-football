/**
 * nflverse keeps team codes consistent across its own datasets, but users
 * (and ESPN's API) sometimes use older codes for relocated/renamed
 * franchises. This normalizes the handful of known aliases; everything
 * else passes through untouched.
 */
const ALIASES: Record<string, string> = {
  LAR: 'LA',
  STL: 'LA',
  SD: 'LAC',
  OAK: 'LV',
  WSH: 'WAS',
  JAC: 'JAX',
};

export function normalizeTeam(code: string): string {
  const upper = code.trim().toUpperCase();
  return ALIASES[upper] ?? upper;
}
