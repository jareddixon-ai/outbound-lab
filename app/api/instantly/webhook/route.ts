// POST /api/instantly/webhook: Instantly tells us when a lead replies.
//
// v1 recorded replies by ticking a box. v2 lets Instantly do it: when a
// reply comes in, the lead is marked replied, with the sequence step that
// got the reply, so Part C fills itself.
//
// Instantly doesn't sign webhooks, so when you create the webhook you add a
// custom header, x-webhook-secret, with the value of INSTANTLY_WEBHOOK_SECRET.
// Requests without it are refused.
// Payload docs: https://developer.instantly.ai/guides/webhook-events

import { z } from "zod";
import { safeEqual } from "@/lib/auth";
import { db } from "@/lib/supabase";

const Payload = z.object({
  event_type: z.string().nullable().optional(),
  campaign_id: z.string().optional(),
  lead_email: z.string().optional(),
  step: z.coerce.number().optional(),
  reply_text_snippet: z.string().optional(),
});

// Events that count as a reply, and the ones that also count as positive.
const REPLY = new Set(["reply_received", "lead_interested", "lead_meeting_booked"]);
const POSITIVE = new Set(["lead_interested", "lead_meeting_booked"]);

export async function POST(request: Request) {
  if (!safeEqual(request.headers.get("x-webhook-secret"), process.env.INSTANTLY_WEBHOOK_SECRET)) {
    return Response.json({ error: "Not allowed." }, { status: 401 });
  }

  const parsed = Payload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Unexpected payload." }, { status: 400 });
  const p = parsed.data;

  // Answer 200 to events we don't use, so Instantly doesn't retry or disable the webhook.
  if (!p.event_type || !REPLY.has(p.event_type) || !p.lead_email) {
    return Response.json({ ignored: true });
  }
  if (process.env.INSTANTLY_CAMPAIGN_ID && p.campaign_id && p.campaign_id !== process.env.INSTANTLY_CAMPAIGN_ID) {
    return Response.json({ ignored: true, reason: "Different campaign" });
  }

  const supabase = db();
  const { data: lead } = await supabase
    .from("leads")
    .select("id,replied,reply_step")
    .eq("email", p.lead_email.toLowerCase())
    .maybeSingle();
  if (!lead) return Response.json({ ignored: true, reason: "No lead with that email" });

  const positive = POSITIVE.has(p.event_type);
  await supabase
    .from("leads")
    .update({
      replied: true,
      replied_at: lead.replied ? undefined : new Date().toISOString(),
      reply_step: lead.reply_step ?? p.step ?? null,
      ...(positive ? { positive_reply: true } : {}),
    })
    .eq("id", lead.id);

  await supabase.from("events").insert({
    lead_id: lead.id,
    type: positive ? "positive_reply" : "replied",
    detail: { source: "instantly", event: p.event_type, step: p.step ?? null, snippet: p.reply_text_snippet?.slice(0, 200) },
  });

  return Response.json({ ok: true });
}
