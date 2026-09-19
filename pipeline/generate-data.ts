/**
 * Precomputes everything the static site needs and writes it to public/data/, so the deployed app never has to
 * fetch nflverse data itself (CORS blocks that from a browser anyway — see README) or run a live backend. Run
 * this locally with `npm run generate-data`, or let the GitHub Actions workflow re-run it on a schedule to keep
 * the deployed site's data current — see .github/workflows/deploy.yml.
 */
import fs from 'node:fs';
import path from 'node:path';
import { CsvRow } from './lib/csv';
import { Datasets, currentSeason, currentWeek, opponentFor } from './lib/datasets';
import { listRosterPlayers, PlayerCandidate } from './lib/players';
import { buildSleeperCrosswalk } from './lib/sleeper';
import { analyzeWr } from './matchup/wr';
import { analyzeRb } from './matchup/rb';
import { analyzeQb } from './matchup/qb';
import { analyzeTe } from './matchup/te';
import { getInjuryStatus, applyInjuryToResult } from './matchup/injury';
import { getUsageTrend, usageTrendComponent } from './matchup/usageTrend';
import { addComponent } from './matchup/util';
import { coordinatorsMeta } from './matchup/coordinators';

const OUT_DIR = path.join(__dirname, '..', 'public', 'data');
const MATCHUPS_DIR = path.join(OUT_DIR, 'matchups');
const TRACKED_POSITIONS = ['WR', 'RB', 'QB', 'TE'];

async function buildPayload(player: PlayerCandidate, games: CsvRow[], season: number, week: number) {
  const opp = opponentFor(games, season, week, player.team);
  if (!opp) return { payload: { player, season, week, bye: true }, isBye: true };

  const base =
    player.position === 'WR'
      ? { position: 'WR' as const, report: await analyzeWr(player.gsisId, player.name, player.team, opp.opponent, season, week) }
      : player.position === 'RB'
        ? { position: 'RB' as const, report: await analyzeRb(player.gsisId, player.name, player.team, opp.opponent, season, week) }
        : player.position === 'QB'
          ? { position: 'QB' as const, report: await analyzeQb(player.gsisId, player.name, player.team, opp.opponent, season, week) }
          : { position: 'TE' as const, report: await analyzeTe(player.gsisId, player.name, player.team, opp.opponent, season, week) };

  const injury = await getInjuryStatus(player.gsisId, season, week);
  let recommendation = applyInjuryToResult(base.report.recommendation, injury);

  // Snap-share trend is a role-change proxy; a starting QB's snap share barely moves outside of a benching (which
  // the injury report / a QB2 taking over roster spot would already surface), so it isn't worth computing there.
  const usageTrend = base.position === 'QB' ? null : await getUsageTrend(player.gsisId, player.team, season);
  if (usageTrend) recommendation = addComponent(recommendation, usageTrendComponent(usageTrend));

  return {
    payload: {
      position: base.position,
      homeAway: opp.homeAway,
      player,
      ...base.report,
      recommendation,
      injuryStatus: injury,
      usageTrend,
    },
    isBye: false,
  };
}

async function main(): Promise<void> {
  const season = currentSeason();
  const { rows: games } = await Datasets.games();
  const week = currentWeek(games, season);
  console.log(`Generating static data for the ${season} season, week ${week}...`);

  fs.mkdirSync(MATCHUPS_DIR, { recursive: true });

  const players = await listRosterPlayers(season, TRACKED_POSITIONS);
  console.log(`${players.length} ${TRACKED_POSITIONS.join('/')} on current active rosters.`);

  fs.writeFileSync(path.join(OUT_DIR, 'players.json'), JSON.stringify(players));

  // Independent of the per-player matchup loop below, so kick it off now and only await it once that's done.
  const sleeperCrosswalkPromise = buildSleeperCrosswalk(players);

  let ok = 0;
  let byes = 0;
  let failed = 0;
  for (const [i, player] of players.entries()) {
    process.stdout.write(`\r[${i + 1}/${players.length}] ${player.name.padEnd(28)}`);
    try {
      const { payload, isBye } = await buildPayload(player, games, season, week);
      if (isBye) byes++;
      else ok++;
      fs.writeFileSync(path.join(MATCHUPS_DIR, `${player.gsisId}.json`), JSON.stringify(payload));
    } catch (err) {
      failed++;
      console.error(`\nFailed for ${player.name} (${player.gsisId}): ${(err as Error).message}`);
    }
  }
  process.stdout.write('\n');

  const sleeperCrosswalk = await sleeperCrosswalkPromise;
  fs.writeFileSync(path.join(OUT_DIR, 'sleeper-index.json'), JSON.stringify(sleeperCrosswalk));

  const meta = {
    season,
    week,
    generatedAt: new Date().toISOString(),
    coordinators: coordinatorsMeta(),
    playerCount: players.length,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta));

  console.log(`Done: ${ok} matchups, ${byes} byes, ${failed} failed. Wrote to ${OUT_DIR}`);
  if (players.length > 0 && failed / players.length > 0.2) {
    throw new Error('More than 20% of players failed to generate — something is likely broken upstream, not just a few edge cases.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
