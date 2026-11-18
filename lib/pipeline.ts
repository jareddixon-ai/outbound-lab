// The lead pipeline: everything that happens to one lead, in order.
//
//   receive -> save -> Claude scores it -> route to an AE -> Salesforce
//
// Every step writes a row to the events table, so there is always a record
// of what happened and why. If the Claude step fails, the lead is still
// saved and routed, and marked "needs_review" instead of being lost.

import { z } from "zod";
import { db } from "./supabase";
import { scoreLead } from "./score";
import { chooseOwner } from "./routing";
import { pickGroup } from "./experiment";
import { createSalesforceLead, salesforceConfigured } from "./salesforce";

// What a lead must look like when it arrives (from Clay, the seed script,
// or curl). Extra fields are ignored. Empty strings count as "not given".
const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalText = z.preprocess(blank, z.string().trim().max(300).optional());

export const LeadInput = z.object({
  name: z.string().trim().min(1, "name is required").max(200),
  company: z.string().trim().min(1, "company is required").max(200),
  title: optionalText,
  domain: optionalText,
  industry: optionalText,
  employee_count: z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : Number(v.replace(/[, ]/g, ""))) : v),
    z.number().int().nonnegative().optional(),
  ),
  source: optionalText,
});
export type LeadInput = z.infer<typeof LeadInput>;

export type PipelineResult = {
  status: "created" | "duplicate";
  lead: Record<string, unknown>;
};

async function logEvent(leadId: string, type: string, detail: Record<string, unknown>) {
  const { error } = await db().from("events").insert({ lead_id: leadId, type, detail });
  if (error) console.error("Couldn't log event", type, error.message);
}

export async function processLead(input: LeadInput): Promise<PipelineResult> {
  const supabase = db();

  // 1. RECEIVE AND SAVE. Pick the A/B group now, because the group decides
  //    which opener style Claude writes. It goes to the smaller group.
  const groupCount = async (g: "A" | "B") =>
    (await supabase.from("leads").select("id", { count: "exact", head: true }).eq("experiment_group", g)).count ?? 0;
  const group = pickGroup({ A: await groupCount("A"), B: await groupCount("B") });
  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      name: input.name,
      company: input.company,
      title: input.title ?? null,
      domain: input.domain?.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? null,
      industry: input.industry ?? null,
      employee_count: input.employee_count ?? null,
      source: input.source ?? "manual",
      experiment_group: group,
    })
    .select()
    .single();

  if (error) {
    // 23505 is the database's code for "this would create a duplicate".
    if (error.code === "23505") {
      // ilike = case-insensitive match. Escape % and _ so they're read literally.
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
  await logEvent(lead.id, "received", { source: lead.source, experiment_group: group });

  // 2. SCORE WITH CLAUDE. A failure here shouldn't lose the lead.
  let score: number | null = null;
  const updates: Record<string, unknown> = {};
  try {
    const result = await scoreLead(lead, group);
    score = result.score;
    Object.assign(updates, { score, score_reason: result.reason, opener: result.opener });
    await logEvent(lead.id, "scored", { score, reason: result.reason });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Scoring failed", lead.id, message);
    await logEvent(lead.id, "score_failed", { error: message });
  }

  // 3. ROUTE. Count how many leads each AE owns right now.
  const { data: ownerRows } = await supabase.from("leads").select("owner").not("owner", "is", null);
  const counts: Record<string, number> = {};
  for (const row of ownerRows ?? []) counts[row.owner] = (counts[row.owner] ?? 0) + 1;

  const decision = chooseOwner(score, counts);
  Object.assign(updates, {
    owner: decision.owner,
    routing_reason: decision.reason,
    status: score === null ? "needs_review" : "routed",
  });
  await logEvent(lead.id, "routed", { owner: decision.owner, reason: decision.reason });

  // 4. SAVE THE RESULTS.
  const { data: finished, error: updateError } = await supabase
    .from("leads")
    .update(updates)
    .eq("id", lead.id)
    .select()
    .single();
  if (updateError) throw new Error(`Couldn't save the results: ${updateError.message}`);

  // 5. SEND TO SALESFORCE. Skipped until the Salesforce keys are set. A
  //    failure here doesn't lose the lead: it stays in Supabase, marked
  //    "sync_failed", and can be sent again later.
  if (!salesforceConfigured()) {
    await logEvent(lead.id, "salesforce_skipped", { reason: "Salesforce keys not set" });
    return { status: "created", lead: finished };
  }
  try {
    const sfId = await createSalesforceLead(finished);
    const { data: synced } = await supabase
      .from("leads")
      .update({ sf_lead_id: sfId, status: "synced" })
      .eq("id", lead.id)
      .select()
      .single();
    await logEvent(lead.id, "synced", { sf_lead_id: sfId });
    return { status: "created", lead: synced ?? finished };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Salesforce sync failed", lead.id, message);
    await supabase.from("leads").update({ status: "sync_failed" }).eq("id", lead.id);
    await logEvent(lead.id, "sync_failed", { error: message });
    return { status: "created", lead: { ...finished, status: "sync_failed" } };
  }
}
