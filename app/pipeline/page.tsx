"use client";
// Part B made visible: the latest leads and what happened to each, step by
// step, read from the events table. Click a lead to see its trail.

import { useEffect, useState } from "react";
import type { SequenceStep } from "@/lib/sequence";

type Event = { type: string; detail: Record<string, unknown>; created_at: string };
type Lead = {
  id: string;
  name: string;
  title: string | null;
  company: string;
  source: string;
  score: number | null;
  score_reason: string | null;
  owner: string | null;
  routing_reason: string | null;
  experiment_group: string | null;
  status: string;
  sf_lead_id: string | null;
  instantly_lead_id: string | null;
  attempts: number;
  sequence: SequenceStep[] | null;
  replied: boolean;
  reply_step: number | null;
  signal: string | null;
  priority: number | null;
  sdr: string | null;
  intro_note: string | null;
  created_at: string;
  events: Event[];
};
type Data = { leads: Lead[]; total: number; synced: number };

const STEP_LABEL: Record<string, string> = {
  received: "Received and saved",
  scored: "Scored by Claude",
  score_failed: "Scoring failed",
  routed: "Routed to an AE",
  synced: "Created in Salesforce",
  salesforce_matched: "Matched an existing Salesforce Lead",
  sync_failed: "Salesforce sync failed",
  salesforce_skipped: "Salesforce skipped",
  replied: "Replied",
  positive_reply: "Positive reply",
  reply_removed: "Reply removed",
  sequence_written: "Sequence written",
  warm_path: "Warm path found",
  paired: "SDR + AE paired",
  instantly_added: "Added to Instantly",
  instantly_skipped: "Instantly skipped",
  instantly_failed: "Instantly hand-off failed",
};
const BAD = new Set(["score_failed", "sync_failed", "instantly_failed"]);

const STATUS_STYLE: Record<string, string> = {
  synced: "bg-pass-bg text-pass",
  routed: "bg-unknown-bg text-unknown",
  needs_review: "bg-warn-bg text-warn",
  queued: "bg-unknown-bg text-unknown",
  processing: "bg-unknown-bg text-unknown",
  sync_failed: "bg-fail-bg text-fail",
};

function scoreStyle(score: number | null) {
  if (score === null) return "bg-unknown-bg text-unknown";
  if (score >= 80) return "bg-pass-bg text-pass";
  if (score >= 50) return "bg-warn-bg text-warn";
  return "bg-fail-bg text-fail";
}

function describe(e: Event, lead: Lead): string {
  const d = e.detail ?? {};
  switch (e.type) {
    case "received":
      return `From ${d.source ?? lead.source}, put in group ${d.experiment_group ?? lead.experiment_group}.`;
    case "scored":
      return `Score ${d.score}. ${d.reason ?? ""}`;
    case "routed":
      return `${d.owner}. ${d.reason ?? ""}`;
    case "synced":
      return `Salesforce Lead ${d.sf_lead_id}.`;
    case "salesforce_matched":
      return `Already in Salesforce as ${d.sf_lead_id}; linked to it instead of making a copy.`;
    case "warm_path":
      return String(d.summary ?? "");
    case "paired":
      return `${d.sdr} books, ${d.ae} joins from the first call.`;
    case "sequence_written":
      return `${d.steps} emails, a different angle at each step.`;
    case "instantly_added":
      return `Instantly lead ${d.instantly_lead_id}. Sends when the campaign is on.`;
    case "replied":
    case "positive_reply":
      return d.step ? `Replied to step ${d.step}${d.source === "instantly" ? ", recorded by Instantly" : ""}.` : "";
    default:
      return typeof d.error === "string" ? d.error : typeof d.reason === "string" ? d.reason : "";
  }
}

const time = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function Pipeline() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pipeline", { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Couldn't load leads.");
        setData(json);
        setOpen(json.leads[0]?.id ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const scored = data?.leads.filter((l) => l.score !== null) ?? [];
  const avg = scored.length ? Math.round(scored.reduce((s, l) => s + (l.score ?? 0), 0) / scored.length) : null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-accent">Outbound Lab v2 · Part B</p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">Lead pipeline</h1>
        <p className="max-w-2xl text-muted">
          Leads arrive from Clay at <code className="rounded bg-unknown-bg px-1 text-sm">/api/leads</code>, which saves
          each one and answers right away. In the background, Claude scores it and writes a 5-step sequence, it&apos;s
          routed to an AE, created in Salesforce and handed to Instantly. Open a lead to see every step and the reason
          behind it.
        </p>
      </header>

      {error && <p className="rounded-lg bg-fail-bg p-4 text-fail">{error}</p>}
      {!data && !error && <p className="text-muted">Loading leads…</p>}

      {data && (
        <>
          <section aria-label="Totals" className="grid grid-cols-3 gap-3">
            {[
              ["Leads", String(data.total)],
              ["In Salesforce", String(data.synced)],
              ["Avg score (latest 25)", avg === null ? "—" : String(avg)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border bg-surface p-4">
                <div className="text-2xl font-semibold tabular-nums">{value}</div>
                <div className="text-xs text-muted">{label}</div>
              </div>
            ))}
          </section>

          <section aria-labelledby="latest" className="flex flex-col gap-3">
            <h2 id="latest" className="text-lg font-semibold">
              Latest {data.leads.length} leads
            </h2>
            <ul className="flex flex-col gap-2">
              {data.leads.map((l) => {
                const isOpen = open === l.id;
                return (
                  <li key={l.id} className="rounded-xl border border-border bg-surface">
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : l.id)}
                      aria-expanded={isOpen}
                      className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 p-4 text-left"
                    >
                      <span className={`rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums ${scoreStyle(l.score)}`}>
                        {l.score ?? "—"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{l.name}</span>
                        <span className="block truncate text-sm text-muted">
                          {l.title ? `${l.title}, ` : ""}
                          {l.company}
                        </span>
                      </span>
                      <span className="text-sm text-muted">
                        {l.owner ?? "—"}
                        {l.sdr ? ` + ${l.sdr}` : ""} · Group {l.experiment_group ?? "—"}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[l.status] ?? "bg-unknown-bg text-unknown"}`}>
                        {l.status === "synced" ? "In Salesforce" : l.status.replace("_", " ")}
                      </span>
                    </button>

                    {isOpen && (
                      <ol className="flex flex-col gap-3 border-t border-border p-4 pl-6">
                        {l.events.map((e, i) => (
                          <li key={i} className="relative flex flex-col gap-0.5 border-l-2 border-border pl-4">
                            <span
                              className={`absolute top-1.5 -left-[5px] h-2 w-2 rounded-full ${BAD.has(e.type) ? "bg-fail" : "bg-accent"}`}
                              aria-hidden
                            />
                            <span className="text-sm font-medium">
                              {STEP_LABEL[e.type] ?? e.type}
                              <span className="ml-2 font-normal text-muted">{time(e.created_at)}</span>
                            </span>
                            <span className="text-sm leading-relaxed text-muted">{describe(e, l)}</span>
                          </li>
                        ))}
                        {l.events.length === 0 && <li className="text-sm text-muted">No steps logged for this lead.</li>}
                      </ol>
                    )}

                    {isOpen && (l.signal || l.intro_note) && (
                      <div className="flex flex-col gap-2 border-t border-border p-4 text-sm leading-relaxed">
                        {l.signal && (
                          <p>
                            <span className="font-medium">Why now: </span>
                            {l.signal}
                          </p>
                        )}
                        {l.intro_note && (
                          <div className="rounded-lg bg-background p-3">
                            <p className="text-xs font-medium text-muted">Intro for the customer to forward</p>
                            <p className="whitespace-pre-line">{l.intro_note}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {isOpen && l.sequence && (
                      <div className="flex flex-col gap-3 border-t border-border p-4">
                        <h3 className="text-sm font-semibold">Follow-up sequence</h3>
                        <ol className="flex flex-col gap-3">
                          {l.sequence.map((s) => (
                            <li key={s.step} className="flex flex-col gap-1 rounded-lg bg-background p-3">
                              <span className="text-xs font-medium text-muted">
                                Step {s.step} · day {s.day} · {s.angle}
                                {l.reply_step === s.step && <span className="ml-2 text-pass">Got the reply</span>}
                              </span>
                              {s.subject && <span className="text-sm font-medium">Subject: {s.subject}</span>}
                              <span className="text-sm leading-relaxed whitespace-pre-line">{s.body}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
