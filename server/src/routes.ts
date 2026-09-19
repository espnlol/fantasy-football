import { Router } from 'express';
import { searchRosterPlayers, getRosterPlayer, getRosterPlayerByEspnId, clearDepthChartCache } from './lib/players';
import { Datasets, currentSeason, currentWeek, opponentFor, clearMemCache } from './lib/datasets';
import { clearOlineCache } from './matchup/oline';
import { clearAllowedCache } from './matchup/opponentAllowed';
import { analyzeWr } from './matchup/wr';
import { analyzeRb } from './matchup/rb';
import { coordinatorsMeta } from './matchup/coordinators';
import { fetchEspnRoster, EspnCredentials } from './espn';

export const router = Router();

router.get('/meta', async (_req, res) => {
  try {
    const season = currentSeason();
    const { rows: games, fetchedAt, stale } = await Datasets.games();
    const week = currentWeek(games, season);
    res.json({ season, week, dataFetchedAt: fetchedAt, dataStale: stale, coordinators: coordinatorsMeta() });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/players/search', async (req, res) => {
  try {
    const q = String(req.query.q ?? '');
    const season = Number(req.query.season ?? currentSeason());
    const results = await searchRosterPlayers(q, season);
    res.json({ results });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/players/by-espn/:espnId', async (req, res) => {
  try {
    const season = Number(req.query.season ?? currentSeason());
    const player = await getRosterPlayerByEspnId(req.params.espnId, season);
    if (!player) {
      res.status(404).json({ error: 'No matching current-roster player for that ESPN id.' });
      return;
    }
    res.json({ player });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/matchup/:gsisId', async (req, res) => {
  try {
    const { gsisId } = req.params;
    const season = Number(req.query.season ?? currentSeason());
    const weekParam = req.query.week ? Number(req.query.week) : undefined;

    const player = await getRosterPlayer(gsisId, season);
    if (!player) {
      res.status(404).json({ error: `No ${season} roster entry found for player id ${gsisId}.` });
      return;
    }

    const { rows: games } = await Datasets.games();
    const week = weekParam ?? currentWeek(games, season);
    const opp = opponentFor(games, season, week, player.team);
    if (!opp) {
      res.json({ player, season, week, bye: true });
      return;
    }

    if (player.position === 'WR') {
      const report = await analyzeWr(player.gsisId, player.name, player.team, opp.opponent, season, week);
      res.json({ position: 'WR', homeAway: opp.homeAway, player, ...report });
      return;
    }
    if (player.position === 'RB') {
      const report = await analyzeRb(player.gsisId, player.name, player.team, opp.opponent, season, week);
      res.json({ position: 'RB', homeAway: opp.homeAway, player, ...report });
      return;
    }
    res
      .status(400)
      .json({ error: `Position ${player.position} isn't supported yet — only WR and RB matchup analysis is implemented.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/refresh', async (_req, res) => {
  clearMemCache();
  clearOlineCache();
  clearAllowedCache();
  clearDepthChartCache();
  res.json({ ok: true });
});

router.post('/espn/roster', async (req, res) => {
  try {
    const { leagueId, season, espnS2, swid, teamId } = req.body ?? {};
    if (!leagueId || teamId === undefined) {
      res.status(400).json({ error: 'leagueId and teamId are required.' });
      return;
    }
    const creds: EspnCredentials = {
      leagueId: String(leagueId),
      season: Number(season ?? currentSeason()),
      espnS2,
      swid,
    };
    const roster = await fetchEspnRoster(creds, Number(teamId));
    res.json({ roster });
  } catch (err) {
    res.status(502).json({
      error: (err as Error).message,
      note: "ESPN's API is undocumented, and this integration could not be exercised from the build environment (its network egress blocks espn.com). If this keeps failing for you, use manual roster entry instead.",
    });
  }
});
