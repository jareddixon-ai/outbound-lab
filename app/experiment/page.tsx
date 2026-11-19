"use client";
// Part C: the experiment dashboard. It reads /api/experiment and lets you
// mark which leads replied. Marking a reply needs the API secret, which is
// kept only in this browser tab (sessionStorage) and sent as a header.

import { useCallback, useEffect, useState } from "react";
import type { GroupCounts, TestResult } from "@/lib/stats";

type Lead = {
  id: string;
  name: string;
  title: string | null;
  company: string;
  score: number | null;
  owner: string | null;
  experiment_group: "A" | "B" | null;
  opener: string | null;
  replied: boolean;
  status: string;
};
type AeRow = { name: string; senior: boolean; leads: number; hot: number; avgScore: number | null; replies: number };
type Data = { leads: Lead[]; groups: Record<"A" | "B", GroupCounts>; test: TestResult; routing: AeRow[]; hotScore: number };

const STYLE_NAME = { A: "Social-trend hook", B: "Peer-brand hook" } as const;
const VERDICT_STYLE = {
  winner: "bg-pass-bg text-pass",
  no_difference: "bg-unknown-bg text-unknown",
  too_early: "bg-warn-bg text-warn",
} as const;

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export default function Experiment() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/experiment", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't load the experiment.");
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    load();
    try {
      setSecret(sessionStorage.getItem("outbound-lab-secret") ?? "");
    } catch {
      /* storage blocked: the field just starts empty */
    }
  }, [load]);

  function rememberSecret(value: string) {
    setSecret(value);
    try {
      sessionStorage.setItem("outbound-lab-secret", value);
    } catch {
      /* fine: it stays in memory for this visit */
    }
  }

  async function toggleReply(lead: Lead) {
    setSaving(lead.id);
    setSaveError(null);
    try {
      const res = await fetch("/api/experiment/reply", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-secret": secret },
        body: JSON.stringify({ id: lead.id, replied: !lead.replied }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't save.");
      await load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-accent">Outbound Lab · Part C</p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">Opener experiment</h1>
        <p className="max-w-2xl text-muted">
          Every new lead is put in group A or B, and Claude writes its first line in that group&apos;s style. Mark the
          leads that replied, and this page tells you whether one style is really doing better or it&apos;s still luck.
        </p>
      </header>

      {error && <p className="rounded-lg bg-fail-bg p-4 text-fail">{error}</p>}
      {!data && !error && <p className="text-muted">Loading leads…</p>}

      {data && (
        <>
          <section aria-labelledby="verdict" className="flex flex-col gap-4">
            <div className={`rounded-xl p-5 ${VERDICT_STYLE[data.test.verdict.kind]}`}>
              <h2 id="verdict" className="text-xl font-semibold">
                {data.test.verdict.headline}
              </h2>
              <p className="mt-1">{data.test.verdict.detail}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {(["A", "B"] as const).map((g) => {
                const c = data.groups[g];
                const rate = g === "A" ? data.test.rateA : data.test.rateB;
                return (
                  <div key={g} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="font-semibold">
                        Group {g} · {STYLE_NAME[g]}
                      </h3>
                      <span className="text-2xl font-semibold tabular-nums">{pct(rate)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-unknown-bg">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(rate * 100, 100)}%` }} />
                    </div>
                    <p className="text-sm text-muted tabular-nums">
                      {c.replies} replies from {c.leads} leads
                    </p>
                  </div>
                );
              })}
            </div>

            <p className="text-sm text-muted tabular-nums">
              Gap (B − A): {(data.test.gap * 100).toFixed(1)} points · z = {data.test.z.toFixed(2)} · p-value ={" "}
              {data.test.pValue.toFixed(3)}. The p-value is the chance of a gap this big if both styles were equally
              good; under 0.05 is the usual bar for &ldquo;probably real&rdquo;.
            </p>
          </section>

          <section aria-labelledby="routing" className="flex flex-col gap-3">
            <h2 id="routing" className="text-lg font-semibold">
              Routing
            </h2>
            <p className="text-sm text-muted">
              Leads scoring {data.hotScore}+ can go to any AE; the rest go only to non-senior AEs. Everyone gets the
              lead when they have the fewest.
            </p>
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full text-sm">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">AE</th>
                    <th className="px-4 py-2 text-right font-medium">Leads</th>
                    <th className="px-4 py-2 text-right font-medium">Hot ({data.hotScore}+)</th>
                    <th className="px-4 py-2 text-right font-medium">Avg score</th>
                    <th className="px-4 py-2 text-right font-medium">Replies</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {data.routing.map((ae) => (
                    <tr key={ae.name} className="border-t border-border">
                      <td className="px-4 py-2">
                        {ae.name}
                        {ae.senior && <span className="ml-2 text-xs text-muted">senior</span>}
                      </td>
                      <td className="px-4 py-2 text-right">{ae.leads}</td>
                      <td className="px-4 py-2 text-right">{ae.hot}</td>
                      <td className="px-4 py-2 text-right">{ae.avgScore ?? "—"}</td>
                      <td className="px-4 py-2 text-right">{ae.replies}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="leads" className="flex flex-col gap-3">
            <h2 id="leads" className="text-lg font-semibold">
              Leads ({data.leads.length})
            </h2>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label htmlFor="secret" className="text-sm text-muted">
                API secret (needed to mark replies)
              </label>
              <input
                id="secret"
                type="password"
                value={secret}
                onChange={(e) => rememberSecret(e.target.value)}
                className="h-10 min-w-0 rounded-lg border border-border bg-surface px-3 sm:w-80"
                autoComplete="off"
              />
            </div>
            {saveError && <p className="rounded-lg bg-fail-bg p-3 text-sm text-fail">{saveError}</p>}

            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full text-sm">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="px-4 py-2 font-medium">Replied</th>
                    <th className="px-4 py-2 font-medium">Lead</th>
                    <th className="px-4 py-2 text-right font-medium">Score</th>
                    <th className="px-4 py-2 font-medium">Group</th>
                    <th className="px-4 py-2 font-medium">AE</th>
                    <th className="px-4 py-2 font-medium">Opener (draft)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.leads.map((l) => (
                    <tr key={l.id} className="border-t border-border align-top">
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          id={`replied-${l.id}`}
                          aria-label={`${l.name} replied`}
                          checked={l.replied}
                          disabled={!secret || saving === l.id}
                          onChange={() => toggleReply(l)}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-medium">{l.name}</div>
                        <div className="text-muted">
                          {l.title ? `${l.title}, ` : ""}
                          {l.company}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{l.score ?? "—"}</td>
                      <td className="px-4 py-2">{l.experiment_group ?? "—"}</td>
                      <td className="px-4 py-2 whitespace-nowrap">{l.owner ?? "—"}</td>
                      <td className="min-w-64 px-4 py-2 text-muted">{l.opener ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
