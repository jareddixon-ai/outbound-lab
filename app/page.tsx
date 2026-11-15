"use client";
// "use client" means this file runs in the visitor's browser, so it can react
// to typing and clicks. It never does DNS lookups itself: it calls our server
// route at /api/check and draws whatever comes back.

import { useState } from "react";
import type { Check, Report, Status } from "@/lib/domain-check";

const EXAMPLES = ["nectarsocial.com", "glossier.com", "olipop.com"];

const STATUS_LABEL: Record<Status, string> = {
  pass: "Pass",
  warn: "Warning",
  fail: "Fail",
  unknown: "Not verified",
};

const STATUS_STYLE: Record<Status, string> = {
  pass: "bg-pass-bg text-pass",
  warn: "bg-warn-bg text-warn",
  fail: "bg-fail-bg text-fail",
  unknown: "bg-unknown-bg text-unknown",
};

const GRADE_STYLE: Record<Report["grade"], string> = {
  A: "bg-pass-bg text-pass",
  B: "bg-pass-bg text-pass",
  C: "bg-warn-bg text-warn",
  D: "bg-fail-bg text-fail",
  F: "bg-fail-bg text-fail",
};

export default function Home() {
  const [input, setInput] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(domain: string) {
    if (!domain.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/check?domain=${encodeURIComponent(domain)}`);
      const data = await res.json();
      if (!res.ok) {
        setReport(null);
        setError(data.error ?? "Something went wrong. Try again.");
      } else {
        setReport(data);
      }
    } catch {
      setReport(null);
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  // Most urgent first: failures, then warnings, then things we couldn't verify.
  const urgency: Record<Status, number> = { fail: 0, warn: 1, unknown: 2, pass: 3 };
  const fixes = (report?.checks.filter((c) => c.fix) ?? []).sort(
    (a, b) => urgency[a.status] - urgency[b.status],
  );

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:py-16">
      <p className="text-sm font-medium text-accent">Outbound Lab · Part 1</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
        Domain Health Checker
      </h1>
      <p className="mt-3 text-base leading-relaxed text-muted">
        Is this domain ready to send outbound email? Enter a domain to check the
        four records inboxes look at, get a grade, and see exactly what to fix.
      </p>

      <form
        className="mt-8 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          run(input);
        }}
      >
        <label htmlFor="domain" className="sr-only">
          Domain
        </label>
        <input
          id="domain"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="yourcompany.com"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="h-12 min-w-0 shrink-0 rounded-lg sm:flex-1 sm:shrink border border-border bg-surface px-4 text-base outline-none placeholder:text-muted/70 focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="h-12 rounded-lg bg-foreground px-6 text-base font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {loading ? "Checking…" : "Check domain"}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>Try:</span>
        {EXAMPLES.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => {
              setInput(d);
              run(d);
            }}
            className="rounded-full border border-border bg-surface px-3 py-1 hover:border-accent hover:text-foreground"
          >
            {d}
          </button>
        ))}
      </div>

      <div aria-live="polite" className="mt-8">
        {error && (
          <p className="rounded-lg bg-fail-bg px-4 py-3 text-sm text-fail">{error}</p>
        )}

        {report && (
          <div className={loading ? "opacity-50 transition-opacity" : "transition-opacity"}>
            <section className="flex items-center gap-5 rounded-xl border border-border bg-surface p-5">
              <div
                className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl text-5xl font-semibold ${GRADE_STYLE[report.grade]}`}
                aria-label={`Grade ${report.grade}`}
              >
                {report.grade}
              </div>
              <div className="min-w-0">
                <p className="truncate font-mono text-sm text-muted">{report.domain}</p>
                <p className="mt-1 text-lg font-medium leading-snug">{report.headline}</p>
                <p className="mt-1 text-sm text-muted">Score {report.score} out of 100</p>
              </div>
            </section>

            {fixes.length > 0 && (
              <section className="mt-4 rounded-xl border border-border bg-surface p-5">
                <h2 className="text-sm font-semibold">
                  {fixes.length === 1 ? "The one thing to fix" : `Fix these ${fixes.length} things, in order`}
                </h2>
                <ol className="mt-3 space-y-3">
                  {fixes.map((c, i) => (
                    <li key={c.id} className="flex gap-3 text-sm leading-relaxed">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-medium text-background">
                        {i + 1}
                      </span>
                      <span>
                        <span className="font-medium">{c.name}:</span> {c.fix}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            <section className="mt-4 space-y-3">
              {report.checks.map((c) => (
                <CheckCard key={c.id} check={c} />
              ))}
            </section>
          </div>
        )}
      </div>

      <section className="mt-12 border-t border-border pt-8">
        <h2 className="text-base font-semibold">Why this matters for outbound</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Gmail, Yahoo and Outlook decide where a cold email lands before anyone
          reads the copy. They check that the sender is allowed to send for the
          domain (SPF), that the message is signed (DKIM), and that the domain
          has told them what to do with fakes (DMARC). Miss one and even a great
          message goes to spam, so reply rates fall and the experiment tells you
          nothing. Checking this first means an A/B test measures the message,
          not the plumbing.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          This tool reads public DNS records only. It doesn&apos;t send email, and
          it can&apos;t see inbox placement or sender reputation, which depend on
          sending history and warmup.
        </p>
      </section>

      <footer className="mt-10 text-xs text-muted">
        A demo built with Claude Code, Next.js and Vercel.
      </footer>
    </main>
  );
}

function CheckCard({ check }: { check: Check }) {
  return (
    <article className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{check.name}</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[check.status]}`}>
          {STATUS_LABEL[check.status]}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">{check.what}</p>
      <p className="mt-3 text-sm leading-relaxed">{check.summary}</p>
      {check.records.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted hover:text-foreground">
            Show the DNS record{check.records.length > 1 ? "s" : ""}
          </summary>
          <ul className="mt-2 space-y-1 rounded-lg bg-background p-3 font-mono text-xs leading-relaxed">
            {check.records.map((r) => (
              <li key={r} className="break-all">
                {r}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
