import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { router } from './routes';
import { Datasets } from './lib/datasets';

const app = express();

/**
 * Only matters when the frontend is deployed separately (e.g. Vercel) from this server (e.g. Railway/Render) —
 * same-origin deployments (the single-process mode below) never hit the browser's CORS check at all. There's no
 * cookie/session auth on this API (ESPN credentials are sent once in a request body, not as browser-managed
 * cookies), so reflecting the caller's origin is safe here; set CORS_ORIGIN to lock it to your frontend's URL.
 */
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors({ origin: corsOrigin ? corsOrigin.split(',').map((o) => o.trim()) : true }));
app.use(express.json());
app.use('/api', router);

const clientDist = path.join(__dirname, '..', '..', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    next();
    return;
  }
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next();
  });
});

const PORT = Number(process.env.PORT ?? 8787);
app.listen(PORT, () => {
  console.log(`Fourth Quarter API listening on http://localhost:${PORT}`);
  // Rebuilding weekly stats from play-by-play is the slowest step (a minute-plus, cold). Kick it off now so
  // it's likely warm by the time someone's finished setting up their roster instead of stalling their first lookup.
  Datasets.playerStats()
    .then(() => console.log('[startup] weekly player stats warmed'))
    .catch((err) => console.warn('[startup] failed to warm weekly player stats:', (err as Error).message));
});
