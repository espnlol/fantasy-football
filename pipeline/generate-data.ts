/**
 * Precomputes everything the static site needs and writes it to public/data/, so the deployed app never has to
 * fetch nflverse data itself (CORS blocks that from a browser anyway — see README) or run a live backend. Run
 * this locally with `npm run generate-data`, or let the GitHub Actions workflow re-run it on a schedule to keep
 * the deployed site's data current — see .github/workflows/deploy.yml.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Datasets, currentSeason, currentWeek, opponentFor } from './lib/datasets';
import { listRosterPlayers } from './lib/players';
import { buildSleeperCrosswalk } from './lib/sleeper';
import { analyzeWr } from './matchup/wr';
import { analyzeRb } from './matchup/rb';
import { coordinatorsMeta } from './matchup/coordinators';

const OUT_DIR = path.join(__dirname, '..', 'public', 'data');
const MATCHUPS_DIR = path.join(OUT_DIR, 'matchups');

async function main(): Promise<void> {
  const season = currentSeason();
  const { rows: games } = await Datasets.games();
  const week = currentWeek(games, season);
  console.log(`Generating static data for the ${season} season, week ${week}...`);

  fs.mkdirSync(MATCHUPS_DIR, { recursive: true });

  const players = await listRosterPlayers(season, ['WR', 'RB']);
  console.log(`${players.length} WR/RB on current active rosters.`);

  fs.writeFileSync(path.join(OUT_DIR, 'players.json'), JSON.stringify(players));

  // Independent of the per-player matchup loop below, so kick it off now and only await it once that's done.
  const sleeperCrosswalkPromise = buildSleeperCrosswalk(players);

  let ok = 0;
  let byes = 0;
  let failed = 0;
  for (const [i, player] of players.entries()) {
    process.stdout.write(`\r[${i + 1}/${players.length}] ${player.name.padEnd(28)}`);
    try {
      const opp = opponentFor(games, season, week, player.team);
      let payload: unknown;
      if (!opp) {
        payload = { player, season, week, bye: true };
        byes++;
      } else if (player.position === 'WR') {
        const report = await analyzeWr(player.gsisId, player.name, player.team, opp.opponent, season, week);
        payload = { position: 'WR', homeAway: opp.homeAway, player, ...report };
        ok++;
      } else {
        const report = await analyzeRb(player.gsisId, player.name, player.team, opp.opponent, season, week);
        payload = { position: 'RB', homeAway: opp.homeAway, player, ...report };
        ok++;
      }
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
