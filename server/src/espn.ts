/**
 * Best-effort ESPN Fantasy Football integration. This calls ESPN's undocumented (but widely reverse-engineered)
 * fantasy API server-side, so a private league's espn_s2/SWID cookies never reach the browser and CORS isn't an
 * issue. IMPORTANT: this environment's network egress blocks espn.com domains by policy, so this code could not
 * be exercised against the real API while building it — it follows the well-documented community-reverse-engineered
 * shape of that API, but treat it as unverified until you've tried it against your own league. Manual roster entry
 * is the supported fallback if it doesn't work for you.
 */

export interface EspnCredentials {
  leagueId: string;
  season: number;
  espnS2?: string;
  swid?: string;
}

export interface EspnRosterPlayer {
  espnId: string;
  fullName: string;
  position: string;
  proTeamId: number;
  lineupSlotId: number;
}

const POSITION_BY_SLOT: Record<number, string> = {
  0: 'QB',
  2: 'RB',
  4: 'WR',
  6: 'TE',
  16: 'D/ST',
  17: 'K',
  23: 'FLEX',
};

export async function fetchEspnRoster(creds: EspnCredentials, teamId: number): Promise<EspnRosterPlayer[]> {
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${creds.season}/segments/0/leagues/${creds.leagueId}?view=mRoster`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (creds.espnS2 && creds.swid) {
    headers.Cookie = `espn_s2=${creds.espnS2}; SWID=${creds.swid}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(
      `ESPN API returned HTTP ${res.status}. Private leagues need a valid espn_s2 + SWID cookie pair from a logged-in browser session; public leagues should work without them.`,
    );
  }
  const data = (await res.json()) as any;
  const team = (data.teams ?? []).find((t: any) => t.id === teamId);
  if (!team) {
    throw new Error(`No team with id ${teamId} was found in this league's response.`);
  }
  const entries = team.roster?.entries ?? [];
  return entries.map((e: any) => ({
    espnId: String(e.playerId),
    fullName: e.playerPoolEntry?.player?.fullName ?? 'Unknown player',
    position: POSITION_BY_SLOT[e.playerPoolEntry?.player?.defaultPositionId] ?? 'FLEX',
    proTeamId: e.playerPoolEntry?.player?.proTeamId ?? 0,
    lineupSlotId: e.lineupSlotId ?? -1,
  }));
}
