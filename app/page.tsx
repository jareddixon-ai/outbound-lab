// The hub: what Outbound Lab is, its three parts, and how one lead moves
// through it. No data here, so the page is built once and served instantly.

import Link from "next/link";

const PARTS = [
  {
    tag: "A",
    href: "/domain-check",
    name: "Domain Health Checker",
    problem: "Emails that never land",
    what: "Grades a sending domain's MX, SPF, DKIM and DMARC from A to F, with the fixes in order of urgency.",
    cta: "Check a domain",
  },
  {
    tag: "B",
    href: "/pipeline",
    name: "Lead Pipeline",
    problem: "Reps chasing the wrong leads",
    what: "Clay sends each lead to an API. Claude scores its fit and drafts an opener, it's routed to an AE, and it lands in Salesforce.",
    cta: "Watch leads flow",
  },
  {
    tag: "C",
    href: "/experiment",
    name: "Opener Experiment",
    problem: "Not knowing which message works",
    what: "Every lead gets opener style A or B. Mark replies, and a significance test says whether one style is really ahead.",
    cta: "See the experiment",
  },
];

const FLOW = [
  ["Clay", "A row is sent to /api/leads with a shared secret"],
  ["Supabase", "Saved, duplicates blocked, put in the smaller A/B group"],
  ["Claude", "Scores fit 0–100 against the ideal customer and drafts an opener"],
  ["Routing", "80+ can go to any AE; the rest go to the AE with the fewest leads"],
  ["Salesforce", "Created as a Lead with score, opener, group and AE"],
];

export default function Overview() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-12 sm:px-6 sm:py-16">
      <header className="flex max-w-3xl flex-col gap-4">
        <p className="text-sm font-medium text-accent">A demo I built for Nectar Social&apos;s outbound problems</p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Outbound Lab</h1>
        <p className="text-lg leading-relaxed text-muted">
          Outbound breaks in three places: emails don&apos;t land, reps work the wrong leads, and nobody knows which
          message works. Each part of this lab handles one of them, end to end, with live data.
        </p>
      </header>

      <section aria-label="The three parts" className="grid gap-4 md:grid-cols-3">
        {PARTS.map((p) => (
          <Link
            key={p.tag}
            href={p.href}
            className="group flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent focus-visible:border-accent"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-pass-bg text-sm font-semibold text-accent">
                {p.tag}
              </span>
              <span className="text-xs font-medium tracking-wide text-muted uppercase">{p.problem}</span>
            </div>
            <h2 className="text-lg font-semibold">{p.name}</h2>
            <p className="flex-1 text-sm leading-relaxed text-muted">{p.what}</p>
            <span className="text-sm font-medium text-accent group-hover:underline">{p.cta} →</span>
          </Link>
        ))}
      </section>

      <section aria-labelledby="flow" className="flex flex-col gap-4">
        <h2 id="flow" className="text-xl font-semibold">
          One lead&apos;s trip, in about five seconds
        </h2>
        <ol className="grid gap-3 sm:grid-cols-5">
          {FLOW.map(([where, what], i) => (
            <li key={where} className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4">
              <span className="text-xs text-muted tabular-nums">Step {i + 1}</span>
              <span className="font-semibold">{where}</span>
              <span className="text-sm leading-snug text-muted">{what}</span>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted">
          Every step writes a line to an event log, so &ldquo;why did this lead go to Maya?&rdquo; always has an
          answer. See it on the <Link href="/pipeline" className="text-accent underline">pipeline page</Link>.
        </p>
      </section>

      <section aria-labelledby="choices" className="grid gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 id="choices" className="text-xl font-semibold">
            Decisions worth knowing
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-muted">
            <li>Nothing sends email. Openers are drafts for a rep to review.</li>
            <li>Claude is told never to invent facts about a company; a wrong &ldquo;fact&rdquo; costs more than a generic line.</li>
            <li>Routing was changed after testing: the first rule gave the senior AE 14 of 26 leads.</li>
            <li>The experiment won&apos;t name a winner under 30 leads per group or above p = 0.05.</li>
            <li>Re-sending a lead is harmless: the database blocks duplicates.</li>
          </ul>
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Built with</h2>
          <p className="text-sm leading-relaxed text-muted">
            Next.js on Vercel, Supabase (Postgres), the Claude API with structured JSON output, Salesforce REST API
            with OAuth client credentials, and Clay&apos;s HTTP API column. Built with Claude Code.
          </p>
          <p className="text-sm text-muted">
            Contacts are made-up people at real brands, using public company information only.{" "}
            <a href="https://github.com/jareddixon-ai/outbound-lab" className="text-accent underline">
              Code on GitHub
            </a>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
