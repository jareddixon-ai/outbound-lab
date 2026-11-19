// GET /api/experiment: everything the experiment dashboard shows.
//
// Reads every lead once, then works out reply rates per A/B group, the
// significance test, and how leads are spread across AEs. Read-only, so it
// needs no secret. The sample leads are made-up people at real brands.

import { connection } from "next/server";
import { db } from "@/lib/supabase";
import { AES, HOT_SCORE } from "@/lib/routing";
import { twoProportionTest, type GroupCounts } from "@/lib/stats";

export async function GET() {
  await connection(); // always fresh: never serve a copy saved at build time

  const { data, error } = await db()
    .from("leads")
    .select("id,name,title,company,score,owner,experiment_group,opener,replied,status,created_at")
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

  return Response.json({ leads, groups, test: twoProportionTest(groups.A, groups.B), routing, hotScore: HOT_SCORE });
}
