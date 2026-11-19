// POST /api/experiment/reply  { id, replied }  (needs the x-api-secret header)
//
// Marks a lead as replied or not. No email is ever sent by this project, so
// replies are recorded by hand. Changing data needs the same secret as
// /api/leads, so a stranger can't fake the experiment's results.

import { z } from "zod";
import { secretMatches } from "@/lib/auth";
import { db } from "@/lib/supabase";

const Body = z.object({ id: z.string().uuid(), replied: z.boolean() });

export async function POST(request: Request) {
  if (!secretMatches(request.headers.get("x-api-secret"))) {
    return Response.json({ error: "Wrong or missing password. Enter the API secret and try again." }, { status: 401 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Send {id, replied} with a lead id and true or false." }, { status: 400 });
  }
  const { id, replied } = parsed.data;

  const { data, error } = await db()
    .from("leads")
    .update({ replied, replied_at: replied ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id,replied")
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "No lead with that id." }, { status: 404 });

  await db().from("events").insert({ lead_id: id, type: replied ? "replied" : "reply_removed", detail: {} });
  return Response.json(data);
}
