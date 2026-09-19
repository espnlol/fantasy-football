import { normalizeTeam } from './teams';
import type { PlayerCandidate } from './players';

/**
 * Builds a { sleeperPlayerId: gsisId } crosswalk, but only for players we actually track (WR/RB on a current
 * roster) — the client then just needs this small file, not Sleeper's own multi-thousand-player dump. Runs at
 * build time (this environment has normal internet access; sleeper.app is unreachable from wherever the rest
 * of this project's data pipeline was built and tested — see README) so a live account can't verify it end to
 * end ahead of time. Matches by Sleeper's own gsis_id field first, falling back to a normalized name+team (then
 * name-only) match in case that field is missing for a given player — cheap insurance against a field being
 * absent or a team-code convention mismatching between sources.
 */
export async function buildSleeperCrosswalk(players: PlayerCandidate[]): Promise<Record<string, string>> {
  let sleeperPlayers: Record<string, SleeperPlayerRaw>;
  try {
    const res = await fetch('https://api.sleeper.app/v1/players/nfl');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    sleeperPlayers = (await res.json()) as Record<string, SleeperPlayerRaw>;
  } catch (err) {
    console.warn(`[sleeper] couldn't fetch player dump, skipping crosswalk this run: ${(err as Error).message}`);
    return {};
  }

  const byGsis = new Map<string, string>();
  const byNameTeam = new Map<string, string>();
  const byNameOnly = new Map<string, string>();

  for (const [sleeperId, p] of Object.entries(sleeperPlayers)) {
    if (p.gsis_id) byGsis.set(p.gsis_id, sleeperId);
    const name = p.full_name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
    if (!name) continue;
    const normName = normalizeName(name);
    if (p.team) byNameTeam.set(`${normName}|${normalizeTeam(p.team)}`, sleeperId);
    if (!byNameOnly.has(normName)) byNameOnly.set(normName, sleeperId);
  }

  const crosswalk: Record<string, string> = {};
  let byId = 0;
  let byNameAndTeam = 0;
  let byNameFallback = 0;
  for (const player of players) {
    const directHit = byGsis.get(player.gsisId);
    if (directHit) {
      crosswalk[directHit] = player.gsisId;
      byId++;
      continue;
    }
    const normName = normalizeName(player.name);
    const teamHit = byNameTeam.get(`${normName}|${normalizeTeam(player.team)}`);
    if (teamHit) {
      crosswalk[teamHit] = player.gsisId;
      byNameAndTeam++;
      continue;
    }
    const nameHit = byNameOnly.get(normName);
    if (nameHit) {
      crosswalk[nameHit] = player.gsisId;
      byNameFallback++;
    }
  }
  const unmatched = players.length - byId - byNameAndTeam - byNameFallback;
  console.log(
    `[sleeper] crosswalk: ${byId} by gsis_id, ${byNameAndTeam} by name+team, ${byNameFallback} by name only, ${unmatched} unmatched.`,
  );
  return crosswalk;
}

interface SleeperPlayerRaw {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  team?: string;
  gsis_id?: string;
}

function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+(jr|sr|ii|iii|iv|v)\.?$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}
