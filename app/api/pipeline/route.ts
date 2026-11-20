// GET /api/pipeline: the latest leads, each with its step-by-step trail
// from the events table. Read-only, so it needs no secret. It never returns
// email addresses: this endpoint is public.

import { connection } from "next/server";
import { db } from "@/lib/supabase";

export async function GET() {
  await connection(); // always fresh

  const { data, error } = await db()
    .from("leads")
    .select(
      "id,name,title,company,source,score,score_reason,owner,routing_reason,experiment_group,status,attempts,sf_lead_id,instantly_lead_id,sequence,replied,reply_step,created_at,events(type,detail,created_at)",
    )
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) return Response.json({ error: `Couldn't read leads: ${error.message}` }, { status: 500 });

  const { count } = await db().from("leads").select("id", { count: "exact", head: true });
  const { count: synced } = await db().from("leads").select("id", { count: "exact", head: true }).eq("status", "synced");

  const leads = (data ?? []).map((l) => ({
    ...l,
    events: [...(l.events ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }));
  return Response.json({ leads, total: count ?? leads.length, synced: synced ?? 0 });
}
