// v2: the Instantly hand-off. Outbound Lab decides who to email and what to
// say; Instantly does what it's good at: warmed-up inboxes, sending on a
// schedule, and catching replies.
//
// The lead is added to ONE campaign. Its five emails travel as custom
// variables, so the campaign's sequence in Instantly is just placeholders:
//   Step 1 subject: {{subject}}   body: {{step1}}
//   Step 2 body: {{step2}}  ...  Step 5 body: {{step5}}
//
// Nothing sends until you turn the campaign on in Instantly.
// API docs: https://developer.instantly.ai/api-reference/lead/create-lead

import type { SequenceStep } from "./sequence";

const BASE = "https://api.instantly.ai/api/v2";

/** True when the API key and campaign are both set. */
export function instantlyConfigured(): boolean {
  return Boolean(process.env.INSTANTLY_API_KEY && process.env.INSTANTLY_CAMPAIGN_ID);
}

export type LeadForInstantly = {
  name: string;
  email: string;
  title: string | null;
  company: string;
  domain: string | null;
  opener: string | null;
  sequence: SequenceStep[];
  experiment_group: string | null;
};

/** Split "Ana Ruiz" into first and last name; one word becomes the first name. */
export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? { first: parts.slice(0, -1).join(" "), last: parts.at(-1)! } : { first: parts[0], last: "" };
}

/** The custom variables the campaign template reads. */
export function instantlyVariables(lead: LeadForInstantly): Record<string, string> {
  const vars: Record<string, string> = {
    subject: lead.sequence[0]?.subject ?? "",
    experiment_group: lead.experiment_group ?? "",
  };
  for (const s of lead.sequence) vars[`step${s.step}`] = s.body;
  return vars;
}

/** Adds the lead to the campaign and returns Instantly's lead id. */
export async function addInstantlyLead(lead: LeadForInstantly): Promise<string> {
  const { first, last } = splitName(lead.name);
  const res = await fetch(`${BASE}/leads`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      campaign: process.env.INSTANTLY_CAMPAIGN_ID,
      email: lead.email,
      first_name: first,
      last_name: last,
      company_name: lead.company,
      job_title: lead.title ?? undefined,
      website: lead.domain ?? undefined,
      personalization: lead.opener ?? undefined,
      custom_variables: instantlyVariables(lead),
      // A Clay re-run must not put the same person in the campaign twice.
      skip_if_in_campaign: true,
    }),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.id) {
    const detail = body?.message ?? body?.error ?? JSON.stringify(body);
    throw new Error(`Instantly rejected the lead (${res.status}): ${detail}`);
  }
  return body.id as string;
}
