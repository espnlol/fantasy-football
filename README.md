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

This is a fully static site — a precompute step writes plain JSON files, and
the app just reads them. No server, no database, no API keys.

```bash
npm install
npm run generate-data   # fetches nflverse data and writes public/data/*.json — takes a minute or two
npm run dev              # http://localhost:5173
npm run build              # typecheck + production build to dist/
npm run typecheck
```

Run `generate-data` once before your first `npm run dev`, and again whenever
you want fresher numbers — `dev`/`build` just serve whatever's already in
`public/data/` (gitignored; it's generated, not committed).

## Deploying — GitHub Pages, kept current automatically

`.github/workflows/deploy.yml` runs `generate-data` + `build` and deploys the
result to GitHub Pages, on every push to `main`, on a daily schedule, and via
a manual "Run workflow" button. That's what keeps the "data generated"
timestamp in the header current through the season without anyone needing to
touch this repo.

**One-time setup this repo needs from you:** Settings → Pages → Source →
**GitHub Actions**. That's it — the workflow handles everything else,
including enabling and updating the deployment itself. I can't flip that
toggle myself (no tool has access to a repo's settings), and it's the kind of
thing that should require an explicit human decision on a repo anyway.

Once that's set, your link is `https://<owner>.github.io/fantasy-football/`.

### Why static, and why not the live-server version this started as

The first version of this had a small Express backend: it downloaded several
seasons of play-by-play on startup, decompressed and aggregated them into an
in-memory weekly-stats table, and served matchup requests live. That's a
fine shape for a host that runs a persistent process (Railway, Render, a
VPS), but there was no such host available to deploy it to from where this
was built — and a live server is also just more than a single-user fantasy
tool needs. Since none of the underlying numbers change more than once a
day (stats only update after games are played), precomputing them and
serving flat files is a strict simplification: no server to keep running,
no cold starts, nothing to pay for. `pipeline/` still holds the exact same
analysis code the live version used — only how and when it runs changed.

One real trade-off: only players who were on an active NFL roster the last
time `generate-data` ran are searchable, and only for their actual upcoming
opponent that week. There's also no ESPN league import — that needs a
server to call ESPN's API from (browsers can't call it directly; ESPN's
API doesn't allow cross-origin requests), which a static site doesn't
have. Sleeper's API is public, so that one works directly from the browser
instead — see below.

### Importing a roster from Sleeper

The dashboard can pull a roster straight from Sleeper by username: enter
it, pick which of that account's leagues, and it adds every WR/RB on that
team. This calls Sleeper's public API directly from the browser (no
login, no cookies, no server) and matches players back to this site's own
data via a small ID crosswalk built at data-generation time
(`pipeline/lib/sleeper.ts`) — Sleeper's own multi-thousand-player dump
never has to touch the client.

Sleeper's API was unreachable from the sandbox this was built in (the same
restriction that shaped the hosting decision above), so unlike everything
else in this project, this integration could not be tested against a real
account before shipping — it's built from Sleeper's public, long-stable
API shape, not verified live. Manual search is unaffected either way.

## Architecture

```
src/                    React 18 + TypeScript + Vite + Tailwind client
  lib/                   Static-JSON API client, shared types, localStorage roster persistence
  components/             PlayerSearch, SleeperConnect, MatchupCard (the main event), ui primitives
  pages/                  DashboardPage, MethodologyPage
pipeline/
  lib/                     nflverse data fetch+cache, CSV parsing, player search/ID crosswalks
  lib/sleeper.ts            builds the Sleeper-id → gsis-id crosswalk (public/data/sleeper-index.json)
  matchup/                  one module per signal (coverage, pass rush, O-line tier, opponent-allowed,
                             career history, coordinators) + util.ts's transparent percentile/composite scoring
  generate-data.ts           writes public/data/{meta,players,sleeper-index}.json + public/data/matchups/<gsisId>.json
  config/coordinators.json    the defensive-coordinator list described below
.github/workflows/deploy.yml  generate-data + build + deploy to GitHub Pages, on push/schedule/manual trigger
```

## Data sources & attribution

- Play-by-play, rosters, snap counts, depth charts, and schedules come from
  [nflverse](https://github.com/nflverse/nflverse-data), an open,
  community-maintained NFL data project released under **CC-BY 4.0**.
- Cornerback coverage and pass-rush stats come from **Pro Football
  Reference's** advanced stats, redistributed via nflverse.
- League/roster import uses [Sleeper's](https://docs.sleeper.com/) public
  read API.
- This project is not affiliated with the NFL, ESPN, PFF, Pro Football
  Reference, or Sleeper.

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
would simplify `pipeline/lib/datasets.ts`, but there's no need to wait on
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
`pipeline/config/coordinators.json` was assembled from web search rather than a
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

- WR and RB only — search doesn't return QBs, TEs, or any other position,
  since the request this was built for was specifically about receivers and
  backs and there's nothing precomputed for them to show.
- Static snapshot, not live: a player is only searchable if they were on an
  active roster the last time `generate-data` ran, and their matchup is
  fixed to whatever their opponent was that same week. A trade, signing, or
  bye-week rollover won't show up until the next scheduled regeneration.
  Sleeper import fetches your actual roster live, but can still only add
  the WR/RB on it that match this same precomputed snapshot — everything
  else on your Sleeper team (QB, TE, K, DEF, or a genuinely unmatched
  player) is silently skipped, with a count shown after import.
- The Sleeper integration itself is unverified end to end (see
  "Importing a roster from Sleeper" above) — it's built from Sleeper's
  documented API shape, not tested against a real account before shipping.
- Early in a season, "this season" splits can be a 1-2 game sample. Every
  such stat shows its game count; the UI surfaces last season's full-sample
  numbers right alongside it for exactly this reason.
- The composite "lean" is a transparent weighted average of the percentiles
  shown beneath it — not a validated predictive model. Treat it as a
  starting point for your own judgment, not a verdict.
