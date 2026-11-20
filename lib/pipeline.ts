// The lead pipeline, v2. It's split in two:
//
//   intakeLead()   receive -> save (A/B group picked atomically) -> "queued"
//                  Runs inside the request, so Clay gets an answer in well
//                  under a second.
//   processLead()  Claude scores + writes the sequence -> route to an AE
//                  (atomically) -> Salesforce -> Instantly
//                  Runs after the response is sent (next/server's after()),
//                  and again from /api/worker for anything that failed.
//
// Every step writes a row to the events table. processLead() only does the
// steps that haven't happened yet, so running it twice is safe.

import { z } from "zod";
import { db } from "./supabase";
import { scoreLead } from "./score";
import { eligibleAes, explainRouting } from "./routing";
import { createSalesforceLead, salesforceConfigured } from "./salesforce";
import { addInstantlyLead, instantlyConfigured } from "./instantly";
import type { Group } from "./experiment";
import type { SequenceStep } from "./sequence";
import {
  bestWarmPath,
  describeWarmPath,
  pairSdr,
  priority,
  warmOwner,
  type Connection,
  type WarmPath,
} from "./warm";

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalText = z.preprocess(blank, z.string().trim().max(300).optional());

export const LeadInput = z.object({
  name: z.string().trim().min(1, "name is required").max(200),
  company: z.string().trim().min(1, "company is required").max(200),
  title: optionalText,
  // v2: optional, but Instantly needs it to add the lead to a campaign.
  email: z.preprocess(blank, z.email("email must be a valid address").max(320).optional()),
  domain: optionalText,
  industry: optionalText,
  employee_count: z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : Number(v.replace(/[, ]/g, ""))) : v),
    z.number().int().nonnegative().optional(),
  ),
  source: optionalText,
  // v2.1: why now? e.g. "Launched a TikTok Shop in October" (from Clay).
  signal: optionalText,
});
export type LeadInput = z.infer<typeof LeadInput>;

/** A background attempt gives up after this many tries and waits for a person. */
export const MAX_ATTEMPTS = 3;

type Lead = {
  id: string;
  name: string;
  title: string | null;
  company: string;
  email: string | null;
  domain: string | null;
  industry: string | null;
  employee_count: number | null;
  source: string;
  score: number | null;
  score_reason: string | null;
  opener: string | null;
  sequence: SequenceStep[] | null;
  owner: string | null;
  routing_reason: string | null;
  experiment_group: Group | null;
  status: string;
  attempts: number;
  sf_lead_id: string | null;
  instantly_lead_id: string | null;
  signal: string | null;
  warm_path: WarmPath | null;
  priority: number | null;
  sdr: string | null;
  intro_note: string | null;
};

async function logEvent(leadId: string, type: string, detail: Record<string, unknown>) {
  const { error } = await db().from("events").insert({ lead_id: leadId, type, detail });
  if (error) console.error("Couldn't log event", type, error.message);
}

const cleanDomain = (d?: string) =>
  d?.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? null;

export type IntakeResult = { status: "queued" | "duplicate"; lead: Record<string, unknown> };

/** Step 1: save the lead. Fast, so it runs inside the request. */
export async function intakeLead(input: LeadInput): Promise<IntakeResult> {
  const supabase = db();

  // insert_lead() picks the A/B group and inserts in one locked transaction.
  const { data: lead, error } = await supabase
    .rpc("insert_lead", {
      p: {
        name: input.name,
        company: input.company,
        title: input.title ?? null,
        email: input.email?.toLowerCase() ?? null,
        domain: cleanDomain(input.domain),
        industry: input.industry ?? null,
        employee_count: input.employee_count ?? null,
        source: input.source ?? "manual",
        signal: input.signal ?? null,
      },
    })
    .single<Lead>();

  if (error) {
    // 23505 = "this would create a duplicate" (same name at the same company).
    if (error.code === "23505") {
      const exact = (s: string) => s.replace(/[\\%_]/g, "\\$&");
      const { data: existing } = await supabase
        .from("leads")
        .select()
        .ilike("name", exact(input.name))
        .ilike("company", exact(input.company))
        .maybeSingle();
      return { status: "duplicate", lead: existing ?? {} };
    }
    throw new Error(`Couldn't save the lead: ${error.message}`);
  }

  await logEvent(lead.id, "received", { source: lead.source, experiment_group: lead.experiment_group });
  return { status: "queued", lead };
}

/**
 * Step 2: everything slow. Claims the lead first (status -> processing) so
 * the after() call and the worker can't both work on it at once.
 */
export async function processLead(id: string): Promise<Lead | null> {
  const supabase = db();

  // A lead stuck in "processing" for 2+ minutes means an earlier run died
  // (a timeout, say), so it can be claimed again.
  const stale = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: claimed } = await supabase
    .from("leads")
    .update({ status: "processing", last_attempt_at: new Date().toISOString() })
    .eq("id", id)
    .or(`status.in.(queued,needs_review,sync_failed),and(status.eq.processing,last_attempt_at.lt.${stale})`)
    .select()
    .maybeSingle<Lead>();
  if (!claimed) return null; // someone else has it, or there's nothing to do

  const lead = claimed;
  const updates: Partial<Lead> = { attempts: lead.attempts + 1 };
  const save = async (fields: Partial<Lead> & { last_error?: string | null }) => {
    const { error } = await supabase.from("leads").update(fields).eq("id", id);
    if (error) throw new Error(`Couldn't save the lead: ${error.message}`);
  };

  // WARM PATH. Does anyone on the team, or a customer, know this person or
  // someone at the company? Checked before scoring, because it changes both
  // the first email and who should send it.
  if (lead.warm_path === null) {
    const { data: rows } = await supabase
      .from("connections")
      .select("owner,kind,person_name,company,title,strength")
      .ilike("company", lead.company.replace(/[\\%_]/g, "\\$&"));
    const path = bestWarmPath(lead, (rows ?? []) as Connection[]);
    if (path) {
      lead.warm_path = path;
      updates.warm_path = path;
      await logEvent(id, "warm_path", { ...path, summary: describeWarmPath(path, lead.company) });
    }
  }

  // SCORE + SEQUENCE. Skipped if a previous attempt already did it.
  if (lead.score === null) {
    try {
      const result = await scoreLead(lead, lead.experiment_group ?? "A", {
        signal: lead.signal,
        warmPath: lead.warm_path,
      });
      Object.assign(updates, {
        score: result.score,
        score_reason: result.reason,
        opener: result.opener,
        sequence: result.sequence,
        intro_note: result.introNote,
      });
      Object.assign(lead, updates);
      await logEvent(id, "scored", { score: result.score, reason: result.reason });
      await logEvent(id, "sequence_written", { steps: result.sequence.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await logEvent(id, "score_failed", { error: message, attempt: updates.attempts });
      // Still route it, so a person sees it, but come back and score it later.
      updates.status = "needs_review";
    }
  }

  // PRIORITY: fit score + a timely signal + a warm path. The work queue sorts by it.
  updates.priority = priority(lead.score, lead.signal, lead.warm_path);

  // ROUTE. A strong warm path goes to the rep who has the relationship.
  // Otherwise route_lead() picks the eligible AE with the fewest leads and
  // saves the owner in one locked transaction.
  const viaWarm = lead.owner === null ? warmOwner(lead.warm_path) : null;
  if (viaWarm && lead.warm_path) {
    updates.owner = viaWarm;
    updates.routing_reason = `Warm path: ${describeWarmPath(lead.warm_path, lead.company)} The relationship beats load balancing.`;
    lead.owner = viaWarm;
    lead.routing_reason = updates.routing_reason;
    await logEvent(id, "routed", { owner: viaWarm, reason: updates.routing_reason, warm: true });
  } else if (lead.owner === null) {
    const eligible = eligibleAes(lead.score).map((ae) => ae.name);
    const { data: routed, error } = await supabase.rpc("route_lead", { p_lead: id, p_eligible: eligible });
    if (error) {
      await save({ ...updates, status: "needs_review", last_error: `Routing failed: ${error.message}` });
      return null;
    }
    const { owner, counts } = routed as { owner: string; counts: Record<string, number> };
    updates.owner = owner;
    updates.routing_reason = explainRouting(lead.score, owner, counts);
    lead.owner = owner;
    lead.routing_reason = updates.routing_reason;
    await logEvent(id, "routed", { owner, reason: updates.routing_reason });
  }

  // SDR + AE PAIR on the very best warm leads.
  const sdr = lead.sdr ?? pairSdr(lead.score, lead.warm_path);
  if (sdr && !lead.sdr) {
    updates.sdr = sdr;
    lead.sdr = sdr;
    await logEvent(id, "paired", { sdr, ae: lead.owner, reason: "Score 90+ with a warm path: an SDR books, the AE joins from the first call." });
  }

  if (updates.status === "needs_review") {
    await save({ ...updates, last_error: "Scoring failed; will retry" });
    return null;
  }
  updates.status = "routed";
  await save({ ...updates, last_error: null });

  // SALESFORCE.
  if (!lead.sf_lead_id) {
    if (!salesforceConfigured()) {
      await logEvent(id, "salesforce_skipped", { reason: "Salesforce keys not set" });
    } else {
      try {
        const sfId = await createSalesforceLead(lead);
        lead.sf_lead_id = sfId;
        await save({ sf_lead_id: sfId, status: "synced" });
        await logEvent(id, "synced", { sf_lead_id: sfId });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await save({ status: "sync_failed", last_error: message });
        await logEvent(id, "sync_failed", { error: message, attempt: updates.attempts });
        return null;
      }
    }
  }

  // INSTANTLY. Only for leads with an email, and only when it's configured.
  // A failure here is logged but doesn't block the lead: it's in Salesforce.
  if (!lead.instantly_lead_id) {
    if (!instantlyConfigured()) {
      await logEvent(id, "instantly_skipped", { reason: "Instantly keys not set" });
    } else if (!lead.email || !lead.sequence) {
      await logEvent(id, "instantly_skipped", { reason: lead.email ? "No sequence" : "No email address" });
    } else {
      try {
        const instantlyId = await addInstantlyLead({ ...lead, email: lead.email, sequence: lead.sequence });
        await save({ instantly_lead_id: instantlyId });
        await logEvent(id, "instantly_added", { instantly_lead_id: instantlyId });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await save({ last_error: message });
        await logEvent(id, "instantly_failed", { error: message });
      }
    }
  }

  const { data: finished } = await supabase.from("leads").select().eq("id", id).maybeSingle<Lead>();
  return finished;
}

/** Leads the worker should try again: stuck, failed, or never picked up. */
export async function leadsNeedingWork(limit = 10): Promise<string[]> {
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data, error } = await db()
    .from("leads")
    .select("id")
    .in("status", ["queued", "needs_review", "sync_failed", "processing"])
    .lt("attempts", MAX_ATTEMPTS)
    // Give after() a head start, and don't retry something mid-flight.
    .or(`last_attempt_at.is.null,last_attempt_at.lt.${twoMinutesAgo}`)
    .lt("created_at", twoMinutesAgo)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Couldn't read the queue: ${error.message}`);
  return (data ?? []).map((r) => r.id as string);
}
