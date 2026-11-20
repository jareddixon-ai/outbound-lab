// GET /api/queue[?owner=Maya%20Chen]: who to work first.
//
// Leads that haven't replied, highest priority first. Priority is the fit
// score plus a bump for a timely signal and for a warm path (lib/warm.ts),
// so with one rep or ten, the order says where the next hour goes.
// Read-only and public, so no email addresses.

import { connection } from "next/server";
import { db } from "@/lib/supabase";
import { AES } from "@/lib/routing";
import { SDRS, describeWarmPath, type WarmPath } from "@/lib/warm";
import type { SequenceStep } from "@/lib/sequence";

export async function GET(request: Request) {
  await connection();
  // Only known names, since the value goes into a filter expression.
  const asked = new URL(request.url).searchParams.get("owner");
  const owner = asked && [...AES.map((a) => a.name), ...SDRS].includes(asked) ? asked : null;

  let q = db()
    .from("leads")
    .select("id,name,title,company,score,score_reason,signal,warm_path,priority,owner,sdr,routing_reason,sequence,intro_note,status,created_at")
    .eq("replied", false)
    .in("status", ["routed", "synced", "sync_failed", "needs_review"])
    .order("priority", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(50);
  if (owner) q = q.or(`owner.eq."${owner}",sdr.eq."${owner}"`);

  const { data, error } = await q;
  if (error) return Response.json({ error: `Couldn't read the queue: ${error.message}` }, { status: 500 });

  const leads = (data ?? []).map((l) => {
    const path = l.warm_path as WarmPath | null;
    const first = (l.sequence as SequenceStep[] | null)?.[0] ?? null;
    return {
      ...l,
      sequence: undefined,
      warm: path ? describeWarmPath(path, l.company) : null,
      firstEmail: first ? { subject: first.subject, body: first.body } : null,
    };
  });
  return Response.json({ leads });
}
