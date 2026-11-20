"use client";
// The work queue: one list, in the order a rep should work it. Built for a
// small team: with one rep there's nothing to route, but there's still a
// best next lead, and the reason it's next is right there.

import { useEffect, useState } from "react";
import { AES } from "@/lib/routing";
import { SDRS } from "@/lib/warm";

type Item = {
  id: string;
  name: string;
  title: string | null;
  company: string;
  score: number | null;
  score_reason: string | null;
  signal: string | null;
  warm: string | null;
  priority: number | null;
  owner: string | null;
  sdr: string | null;
  routing_reason: string | null;
  intro_note: string | null;
  status: string;
  firstEmail: { subject: string | null; body: string } | null;
};

const PEOPLE = [...AES.map((a) => a.name), ...SDRS];

export default function Queue() {
  const [owner, setOwner] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    setItems(null);
    fetch(`/api/queue${owner ? `?owner=${encodeURIComponent(owner)}` : ""}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Couldn't load the queue.");
        setItems(json.leads);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [owner]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-accent">Outbound Lab v2 · Work queue</p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">Who to work first</h1>
        <p className="max-w-2xl text-muted">
          Ordered by priority: Claude&apos;s fit score, plus 10 for a timely signal, plus up to 25 for a warm path. A
          75 that a rep knows personally beats a cold 90. Leads drop off the list when they reply.
        </p>
      </header>

      <label className="flex w-full max-w-xs flex-col gap-1 text-sm">
        <span className="font-medium">Show the queue for</span>
        <select
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2"
        >
          <option value="">Everyone</option>
          {PEOPLE.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="rounded-lg bg-fail-bg p-4 text-fail">{error}</p>}
      {!items && !error && <p className="text-muted">Loading the queue…</p>}
      {items && items.length === 0 && <p className="text-muted">Nothing waiting. Everyone has replied or nothing has come in yet.</p>}

      {items && items.length > 0 && (
        <ol className="flex flex-col gap-2">
          {items.map((l, i) => {
            const isOpen = open === l.id;
            return (
              <li key={l.id} className="rounded-xl border border-border bg-surface">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : l.id)}
                  aria-expanded={isOpen}
                  className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 p-4 text-left"
                >
                  <span className="w-6 text-sm text-muted tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{l.name}</span>
                    <span className="block truncate text-sm text-muted">
                      {l.title ? `${l.title}, ` : ""}
                      {l.company}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1.5 text-xs">
                    {l.warm && <span className="rounded-full bg-pass-bg px-2 py-0.5 font-medium text-pass">Warm</span>}
                    {l.signal && <span className="rounded-full bg-warn-bg px-2 py-0.5 font-medium text-warn">Signal</span>}
                    {l.sdr && <span className="rounded-full bg-unknown-bg px-2 py-0.5 font-medium text-unknown">SDR + AE</span>}
                  </span>
                  <span className="text-sm text-muted">
                    {l.owner ?? "—"}
                    {l.sdr ? ` + ${l.sdr}` : ""}
                  </span>
                  <span className="text-right text-sm tabular-nums">
                    <span className="block font-semibold">{l.priority ?? "—"}</span>
                    <span className="block text-xs text-muted">fit {l.score ?? "—"}</span>
                  </span>
                </button>

                {isOpen && (
                  <div className="flex flex-col gap-3 border-t border-border p-4 text-sm leading-relaxed">
                    {l.warm && (
                      <p>
                        <span className="font-medium">Warm path: </span>
                        {l.warm}
                      </p>
                    )}
                    {l.signal && (
                      <p>
                        <span className="font-medium">Why now: </span>
                        {l.signal}
                      </p>
                    )}
                    {l.score_reason && (
                      <p>
                        <span className="font-medium">Fit: </span>
                        {l.score_reason}
                      </p>
                    )}
                    {l.routing_reason && <p className="text-muted">{l.routing_reason}</p>}
                    {l.firstEmail && (
                      <div className="rounded-lg bg-background p-3">
                        <p className="text-xs font-medium text-muted">First email</p>
                        {l.firstEmail.subject && <p className="font-medium">Subject: {l.firstEmail.subject}</p>}
                        <p className="whitespace-pre-line">{l.firstEmail.body}</p>
                      </div>
                    )}
                    {l.intro_note && (
                      <div className="rounded-lg bg-background p-3">
                        <p className="text-xs font-medium text-muted">Intro for the customer to forward</p>
                        <p className="whitespace-pre-line">{l.intro_note}</p>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
