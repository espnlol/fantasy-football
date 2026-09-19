import type { MetaResponse } from '../lib/types';
import { Card, SectionLabel } from '../components/ui';

export function MethodologyPage({ meta }: { meta: MetaResponse | null }) {
  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-50">What this is, and isn't</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          This tool ranks start/sit decisions using real season and career statistics from public NFL data — not a
          proprietary rating service. Every recommendation shows its component numbers so you can judge them
          yourself rather than trust a single opaque score. Where the ideal data doesn't exist for free (see below),
          this uses the closest honest substitute and says so, rather than making something up.
        </p>
      </Card>

      <Card className="p-6">
        <SectionLabel>Data sources</SectionLabel>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-300">
          <li>
            Play-by-play, rosters, snap counts, depth charts, and schedules from{' '}
            <a
              href="https://github.com/nflverse/nflverse-data"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-field-700 underline dark:text-field-400"
            >
              nflverse
            </a>{' '}
            — an open, community-maintained NFL data project, licensed CC-BY 4.0. Every weekly box score you see
            here (targets, yards, receptions, fantasy points) is computed from play-by-play directly, because
            nflverse's own precomputed "player_stats" convenience file has been frozen since May 2025 and never
            updated for the current season.
          </li>
          <li>
            Cornerback coverage and pass-rush stats (targets allowed, completion% allowed, pressures, hurries,
            hits, sacks) come from Pro Football Reference's advanced stats, via nflverse.
          </li>
          <li>
            Injury status comes from the NFL's own official weekly injury report (practice participation and
            game designation), via nflverse — not a news feed or social media.
          </li>
          <li>
            Fantasy points are standard full-PPR, computed from the box score. Your league's actual scoring (0.5
            PPR, TE premium, return TDs, bonus thresholds) may differ slightly.
          </li>
        </ul>
      </Card>

      <Card className="p-6">
        <SectionLabel>Cornerback matchups</SectionLabel>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          There is no free, public data on which specific defender covered which specific receiver on a given
          play — that's the kind of all-22 charting PFF and NFL Next Gen Stats sell, not something available via
          open data. What this shows instead is each cornerback's own season-long coverage performance
          (targets, completion% allowed, yards per target, passer rating allowed), for the corners who've actually
          played the most defensive snaps at the position this season. Treat it as "how good has this corner been
          in coverage," not "this corner will be on this receiver."
        </p>
      </Card>

      <Card className="p-6">
        <SectionLabel>Offensive line vs. pass rush</SectionLabel>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Per-lineman pass-block grades are PFF's paywalled product — there's no free equivalent. As the best
          available substitute, an offense's O-line quality is proxied by how often its own quarterback(s) have
          been pressured this season (from PFR's pressure stats): a lower pressure rate implies better protection.
          This is a whole-offense number, not a per-player grade, and it's affected by more than the offensive
          line alone (scheme, quarterback mobility, play calling). Opposing pass rushers are shown individually
          (their real pressures/hurries/hits/sacks), along with their pressure rate specifically in games against
          offensive lines that graded out in the same tier as the matchup you're looking at.
        </p>
      </Card>

      <Card className="p-6">
        <SectionLabel>Injury status</SectionLabel>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          The banner on a player's card (Out / Doubtful / Questionable) and the matching line in "why this lean"
          both come from that week's official NFL injury report — the same practice-participation and
          game-status designations teams file, not a tweet or an article characterizing them. Out and Doubtful
          override the lean to <strong>Avoid</strong> outright, regardless of how good the matchup looks — the
          matchup score is still shown, just not allowed to say "start" for someone very unlikely to play.
          Questionable is treated as a real but partial penalty rather than a hard override, since most
          Questionable tags do end up playing.
        </p>
      </Card>

      <Card className="p-6">
        <SectionLabel>Usage trend ("is this player's role changing")</SectionLabel>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          The ↑/↓ next to a player's matchup, and the matching "usage trend" line in the breakdown, compares
          their offensive snap share over the last 3 games to their season average. It's the best free,
          structured stand-in for "is a coach quietly giving this player more or fewer touches" — a real shift in
          role shows up here directly, without needing to interpret anyone's words. It only appears once a player
          has at least 3 games on the books (too little data before that to call anything a trend), and like any
          proxy it can be noisy — a blowout that pulled starters early looks the same as a real change. Read it as
          a data point, not a verdict.
        </p>
      </Card>

      <Card className="p-6">
        <SectionLabel>Why there's no Twitter, ESPN, or Yahoo "insider" news here</SectionLabel>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          This was asked for directly, and it's worth being straightforward about why it isn't in here: there's
          no free, structured, machine-readable feed of "what a beat reporter tweeted" or "what a coach said in a
          press conference." Reading that kind of information at all means either paying for API access (X's
          API is no longer free at any meaningful volume) or scraping sites whose terms of service generally
          prohibit it (ESPN, Yahoo) — and even with access to the raw text, turning "Coach says rookie will see
          more third-down work" into a number this app could use means an ongoing per-article AI reading job, not
          a one-time build. That's a real, buildable feature, but it's a fundamentally different, ongoing-cost
          piece of infrastructure (an API key, a paid model budget) than everything else on this page, which all
          runs for free. Injury status and usage trend above are the two structured, free proxies that cover most
          of the same ground — official designations for "is this player playing," snap-share trend for "is
          their role changing" — without needing anyone's commentary interpreted.
        </p>
      </Card>

      <Card className="p-6">
        <SectionLabel>Defensive coordinators</SectionLabel>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Each opponent's current defensive coordinator is shown for context next to the quarterback's history
          against that defense. This list was built from web search rather than a structured, verifiable feed —
          Wikipedia and team sites were both unreachable from the environment this was built in — and it has{' '}
          <strong>not</strong> been checked against a primary source. Two entries were dropped outright because
          the sources contradicted each other. Coordinators also get fired mid-season. Confirm any name you're
          relying on, and treat a blank team as "not verified" rather than "no coordinator."
        </p>
        {meta?.coordinators && (
          <p className="mt-2 text-xs text-slate-400">
            List last assembled {meta.coordinators.asOf}, confidence: {meta.coordinators.confidence}.
          </p>
        )}
      </Card>

      <Card className="p-6">
        <SectionLabel>How this site works</SectionLabel>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          This is a fully static site — no backend, nothing running on a server for your requests. Every
          player's matchup report is precomputed ahead of time (see <code>pipeline/generate-data.ts</code>) and
          shipped as plain JSON files; the app just reads them. A GitHub Actions workflow re-runs that
          precomputation on a schedule and redeploys automatically, which is what keeps the "data generated"
          timestamp in the header current through the season.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          One consequence: only players who were on an active NFL roster the last time the data was generated are
          searchable, and only for their actual upcoming opponent that week — not a database of every matchup
          that ever was.
        </p>
      </Card>

      <Card className="p-6">
        <SectionLabel>Sleeper import</SectionLabel>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Unlike ESPN, Sleeper's API is genuinely public — reading a username's leagues and rosters needs no
          login or cookies, so this calls it directly from your browser with no server in between. It also fetches
          your Sleeper roster live, at the moment you import, rather than from a periodic snapshot; matching each
          player back to this site's own data (to know who they play this week) uses a small ID crosswalk built
          the same way the rest of this site's data is — precomputed ahead of time, not looked up live.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          One honesty note: Sleeper's API was unreachable from the sandbox this was built in — the same network
          restriction that shaped the hosting choice this site ended up with — so this integration is built from
          Sleeper's long-standing, widely-documented public API shape rather than tested end to end against a
          real account before shipping. If an import doesn't work for your league, manual search is unaffected
          and always available.
        </p>
      </Card>

      <Card className="p-6">
        <SectionLabel>Small samples early in the season</SectionLabel>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Every "this season" stat shows its game count (n=). Early in the year that number can be 1 or 2 games —
          treat those as noisy, and lean more on the "last season" figures shown alongside them until the sample
          grows.
        </p>
      </Card>
    </div>
  );
}
