# Fourth Quarter — Start/Sit Matchup Analyzer

A weekly fantasy football start/sit tool for your own lineup. Add your WRs and
RBs and it pulls their real matchup for the week — opponent history, defensive
tendencies, and (for WR/RB specifically, per how this was scoped) the coverage
and pass-rush detail below — and shows a transparent lean with every number
that went into it. It never collapses that down to a single unexplained score.

## What it actually checks

**For a WR:**
- The receiver's own career history against this specific opponent.
- The opponent's pass defense allowed to the WR position — this season, last
  season, and the last 4 games.
- The opponent's most-used cornerbacks' season-long coverage stats (targets,
  completion% allowed, yards/target, passer rating allowed).
- The starting QB's history against this defense, with the opponent's current
  defensive coordinator shown alongside it for context.

**For a RB:**
- The same own-history and run-defense-allowed splits as above.
- The RB's own offensive line pass-block quality this season (proxied from
  the team's own QB pressure rate — see Methodology below for why).
- The opponent's individual pass rushers' real production this season
  (pressures/hurries/hits/sacks), including their rate specifically in games
  against offensive lines rated the same tier as this matchup.

Every one of those is a real, live, computed number — never a guess dressed
up as one. Where the ideal data isn't publicly available for free (true
per-play coverage assignments, per-lineman pass-block grades), the app uses
the closest honest substitute and says so explicitly, both in the app's
**Methodology** tab and below.

## Running it

```bash
npm install        # also installs server/ (postinstall)
npm run dev         # client on :5173 (proxies /api to the server), server on :8787
npm run build        # typecheck + production client build to dist/
npm run typecheck
```

No API keys or accounts are required for the core matchup analysis — it pulls
directly from nflverse's public data on every cold request and caches it to
`server/.cache/` (gitignored) with a several-hour TTL. Use the **Refresh
data** button in the header to force a re-pull mid-session.

## Deploying

This is a two-piece app (a static React frontend + a stateful Node API), so
"deploy it" means picking one of two shapes:

### Option A — one host, one process (simplest if the host supports it)

`cd server && npm run build && npm start` serves the built client *and* the
API from a single Node process on `$PORT`. Run `npm run build` at the repo
root first so `dist/` exists for it to serve. This is the right shape for
any host that runs a persistent Node process — a VPS, Railway, Render, Fly.io,
etc. — but **not Vercel**: its serverless functions are ephemeral and don't
support what this server does on startup (see the note below), so this
option doesn't apply there.

### Option B — split: frontend on Vercel, backend on Railway/Render

This is the shape to use if you specifically want a Vercel link. The backend
needs a host that runs a normal long-lived Node process — Railway and Render
both do this on their free tiers; Vercel's serverless functions do not (more
on why below).

1. **Backend, on Railway or Render:** create a new web service from this
   repo, with:
   - Root/base directory: `server`
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - No environment variables are required to start. `PORT` is provided by
     the platform automatically.
   - Note the public URL it gives you (e.g. `https://your-app.up.railway.app`).
2. **Frontend, on Vercel:** import this repo as a new project, with:
   - Root directory: the repo root (leave as-is)
   - Framework preset: Vite (auto-detected; `vercel.json` also pins this)
   - Add an environment variable `VITE_API_BASE_URL` set to the backend URL
     from step 1 (no trailing slash) — see `.env.example`.
   - Deploy. You'll get your `*.vercel.app` link from this step.
3. **Optional hardening:** back on the backend host, set a `CORS_ORIGIN` env
   var to your Vercel URL from step 2 and redeploy — this locks the API to
   only answer that origin instead of any origin. See `server/.env.example`.

I can't run either of these steps myself: this project was built in a
sandbox whose network policy blocks Vercel, Railway, Render, Fly.io, and
Netlify outright (not something specific to one provider), and account
linking has to happen on your end regardless, credentials-wise. Everything
above is prepared and tested locally — CORS, the configurable API base URL,
the build commands — so it's just clicking through the two dashboards.

**Why not put the backend on Vercel too?** On startup (and whenever you hit
**Refresh data**), the backend downloads several seasons of play-by-play,
decompresses, and aggregates them into an in-memory weekly stats table — a
one-time job that takes way longer than a serverless function is allowed to
run, and produces state (that in-memory table, the on-disk cache) that a
stateless, ephemeral function can't retain between requests anyway. It's
written to not block other requests while that runs (see
`server/src/lib/datasets.ts`), which only makes sense for a process that
stays alive.

**Cold starts:** on either option, the first request after a fresh deploy or
a spun-down free-tier instance waking back up will lag behind the
`[startup] weekly player stats warmed` log line while that aggregation
finishes in the background — expect roughly a minute the very first time,
much less once `server/.cache/` is warm (if the host's disk persists across
restarts; Railway's does by default, plan-dependent on Render).

### Optional: connect your ESPN league

The dashboard's roster is manual-add by default (search, click, done —
persisted in your browser's local storage, never sent anywhere but this app's
own server). There's also a best-effort ESPN import: enter your league ID and
team ID (and, for a private league, your `espn_s2`/`SWID` session cookies) and
it fetches your roster server-side, so private-league cookies never touch
your browser's network tab. **This could not be tested against a real ESPN
league** while building it — the sandbox this was built in blocks network
access to espn.com entirely — so treat it as unverified until you've tried it
against your own league. Manual search always works and is the better-tested
path.

## Architecture

```
src/                    React 18 + TypeScript + Vite + Tailwind client
  lib/                   API client, shared types, localStorage roster persistence
  components/             PlayerSearch, MatchupCard (the main event), EspnConnect, ui primitives
  pages/                  DashboardPage, MethodologyPage
server/
  src/
    lib/                   nflverse data fetch+cache, CSV parsing, player search/ID crosswalks
    matchup/                one module per signal (coverage, pass rush, O-line tier, opponent-allowed,
                             career history, coordinators) + util.ts's transparent percentile/composite scoring
    espn.ts                 best-effort ESPN Fantasy API proxy
    routes.ts, index.ts      Express app
  config/coordinators.json   the defensive-coordinator list described below
```

## Data sources & attribution

- Play-by-play, rosters, snap counts, depth charts, and schedules come from
  [nflverse](https://github.com/nflverse/nflverse-data), an open,
  community-maintained NFL data project released under **CC-BY 4.0**.
- Cornerback coverage and pass-rush stats come from **Pro Football
  Reference's** advanced stats, redistributed via nflverse.
- This project is not affiliated with the NFL, ESPN, PFF, or Pro Football
  Reference.

### Why weekly stats are computed from play-by-play, not nflverse's own "player_stats" file

nflverse publishes a convenient pre-aggregated weekly player-stats file that
almost every fantasy tool built on this ecosystem uses. While building this,
that file (and its per-position offense/defense/kicking variants) turned out
to be **frozen since May 2025** — it stops mid-way through the 2024 season
and was never updated for 2025 or 2026, even though it's still served with a
current `Last-Modified` header. Rather than silently ship stale data, this
app rebuilds the same weekly box scores directly from nflverse's play-by-play
release (the `pbp` tag), which **is** updated same-day. Fantasy points are
computed as standard full-PPR from that box score; your league's exact
scoring settings (0.5 PPR, TE premium, return TDs, fumble/2-point rules) may
differ slightly. If nflverse's own file starts updating again, swapping back
would simplify `server/src/lib/datasets.ts`, but there's no need to wait on
that.

### Cornerback matchups — what this is and isn't

There's no free, public data on which specific defender covered which
specific receiver on a given play. That's the kind of all-22 charting PFF and
NFL Next Gen Stats sell, not open data. What's shown instead is each
cornerback's own season-long coverage performance, for the corners who've
actually played the most defensive snaps at the position this season (real
game participation, not a scraped depth chart — see below for why that
distinction mattered). Read it as "how good has this corner been in
coverage," not "this corner will be matched on this receiver."

### Offensive line vs. pass rush — what this is and isn't

Per-lineman pass-block grades are PFF's paywalled product; there's no free
equivalent. As the best available substitute, an offense's O-line quality is
proxied by how often its own quarterback(s) have been pressured this season
(from PFR's pressure stats): a lower pressure rate implies better protection.
That's a whole-offense number, not a per-player grade, and it's shaped by
more than the O-line alone (scheme, QB mobility, play calling). The
opponent's individual pass rushers are still shown with their real,
individual production, plus their pressure rate specifically in games
against O-lines that graded into the same tier as the matchup being viewed.

### Defensive coordinators — unverified, on purpose flagged as such

Each opponent's current DC is shown next to the QB-vs-defense history, for
context (e.g. "this history is against a totally different coordinator").
`server/config/coordinators.json` was assembled from web search rather than a
structured feed — Wikipedia and team sites were both unreachable from the
build environment — and has **not** been checked against a primary source.
Two entries that came back contradictory (the same person credited to two
teams) were dropped rather than guessed at; a few teams have no entry at all
for the same reason. It's a plain, hand-editable JSON file — fix anything
you know to be wrong, and prefer leaving a team `null` over guessing, since a
wrong name is worse than an honest gap here.

### Depth charts vs. snap counts

nflverse's `depth_charts` release is a rolling log of every intraday
snapshot all season (not one current snapshot), and — independent of that —
depth-chart projections can simply be stale or wrong between games. Every
"who's the starter" decision in this app (starting QB, most-used corners)
is instead resolved from **actual snap counts** in games already played,
falling back to the depth chart only before Week 1 snap data exists.

## Known limitations

- WR and RB only. QB/TE roster entries are shown but not analyzed — the
  request this was built for was specifically about receivers and backs.
- Early in a season, "this season" splits can be a 1-2 game sample. Every
  such stat shows its game count; the UI surfaces last season's full-sample
  numbers right alongside it for exactly this reason.
- The composite "lean" is a transparent weighted average of the percentiles
  shown beneath it — not a validated predictive model. Treat it as a
  starting point for your own judgment, not a verdict.
