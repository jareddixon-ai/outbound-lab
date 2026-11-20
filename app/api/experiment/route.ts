// GET /api/experiment: everything the experiment dashboard shows.
//
// Reads every lead once, then works out reply rates per A/B group, the
// significance test, and how leads are spread across AEs. Read-only, so it
// needs no secret. The sample leads are made-up people at real brands.

import { connection } from "next/server";
import { db } from "@/lib/supabase";
import { AES, HOT_SCORE } from "@/lib/routing";
import { twoProportionTest, type GroupCounts } from "@/lib/stats";
import { scoreBand, segmentTable, sizeBand, titleLevel } from "@/lib/segments";

export async function GET() {
  await connection(); // always fresh: never serve a copy saved at build time

  const { data, error } = await db()
    .from("leads")
    .select(
      "id,name,title,company,employee_count,score,owner,experiment_group,opener,replied,positive_reply,reply_step,warm_path,signal,status,created_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    const missingColumn = /replied/.test(error.message);
    return Response.json(
      {
        error: missingColumn
          ? "The replies column doesn't exist yet. Run supabase/002_replies.sql in Supabase's SQL Editor."
          : `Couldn't read leads: ${error.message}`,
      },
      { status: 500 },
    );
  }

  const leads = data ?? [];
  const groups: Record<"A" | "B", GroupCounts> = { A: { leads: 0, replies: 0 }, B: { leads: 0, replies: 0 } };
  for (const l of leads) {
    const g = l.experiment_group as "A" | "B" | null;
    if (g !== "A" && g !== "B") continue;
    groups[g].leads += 1;
    if (l.replied) groups[g].replies += 1;
  }

  const routing = AES.map((ae) => {
    const mine = leads.filter((l) => l.owner === ae.name);
    const scored = mine.filter((l) => typeof l.score === "number");
    return {
      name: ae.name,
      senior: ae.senior,
      leads: mine.length,
      hot: scored.filter((l) => l.score >= HOT_SCORE).length,
      avgScore: scored.length ? Math.round(scored.reduce((s, l) => s + l.score, 0) / scored.length) : null,
      replies: mine.filter((l) => l.replied).length,
    };
  });

  // v2: break the result down by who the lead is, so "B wins overall" can't
  // hide "A wins with founders". Also: do high scores really reply more, do
  // warm leads beat cold, and which sequence step got the reply?
  const segments = {
    "Title level": segmentTable(leads, (l) => titleLevel(l.title)),
    "Company size": segmentTable(leads, (l) => sizeBand(l.employee_count)),
    "Fit score": segmentTable(leads, (l) => scoreBand(l.score)),
    "Warm or cold": segmentTable(leads, (l) => (l.warm_path ? "Warm path" : "Cold")),
    "Signal": segmentTable(leads, (l) => (l.signal ? "Had a signal" : "No signal")),
  };
  const positive = {
    A: leads.filter((l) => l.experiment_group === "A" && l.positive_reply).length,
    B: leads.filter((l) => l.experiment_group === "B" && l.positive_reply).length,
  };
  const byStep: Record<string, number> = {};
  for (const l of leads) if (l.replied && l.reply_step) byStep[l.reply_step] = (byStep[l.reply_step] ?? 0) + 1;

  return Response.json({
    leads,
    groups,
    test: twoProportionTest(groups.A, groups.B),
    routing,
    hotScore: HOT_SCORE,
    segments,
    positive,
    byStep,
  });
}
