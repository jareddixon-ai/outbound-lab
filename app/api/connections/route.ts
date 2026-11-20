// POST /api/connections: load who-knows-whom for warm intros.
//
// Body: { owner, kind?, connections: [{ person_name, company, title?, strength? }] }
// Needs the x-api-secret header. Only names, companies, titles and a 0-3
// strength are stored: no emails, no profile URLs. Re-sending the same
// person updates their strength instead of adding a duplicate.
//
// scripts/import-connections.mjs turns a LinkedIn Connections.csv export
// into this request.

import { z } from "zod";
import { secretMatches } from "@/lib/auth";
import { db } from "@/lib/supabase";

const Body = z.object({
  owner: z.string().trim().min(1).max(200),
  kind: z.enum(["rep", "customer", "past_champion"]).default("rep"),
  connections: z
    .array(
      z.object({
        person_name: z.string().trim().min(1).max(200),
        company: z.string().trim().min(1).max(200),
        title: z.string().trim().max(300).optional(),
        strength: z.number().int().min(0).max(3).default(1),
      }),
    )
    .min(1)
    .max(5000),
});

export async function POST(request: Request) {
  if (!secretMatches(request.headers.get("x-api-secret"))) {
    return Response.json({ error: "Missing or wrong x-api-secret header." }, { status: 401 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Unexpected body.", problems: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      { status: 400 },
    );
  }
  const { owner, kind, connections } = parsed.data;

  // One person once per owner, even if the file lists them twice.
  const unique = new Map<string, (typeof connections)[number]>();
  for (const c of connections) unique.set(`${c.person_name}|${c.company}`.toLowerCase(), c);

  const rows = [...unique.values()].map((c) => ({ owner, kind, ...c, title: c.title ?? null }));
  let saved = 0;
  for (const row of rows) {
    // Upsert by hand: the unique index is on lower(...) expressions, which
    // PostgREST's on_conflict can't name.
    const { data: existing } = await db()
      .from("connections")
      .select("id")
      .ilike("owner", row.owner)
      .ilike("person_name", row.person_name)
      .ilike("company", row.company)
      .maybeSingle();
    const { error } = existing
      ? await db().from("connections").update({ strength: row.strength, title: row.title, kind }).eq("id", existing.id)
      : await db().from("connections").insert(row);
    if (error) return Response.json({ error: error.message, saved }, { status: 500 });
    saved += 1;
  }
  return Response.json({ saved });
}
