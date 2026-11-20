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

// ---------------------------------------------------------------------------
// Inbox health. Deliverability lives in the sending inboxes, not just in DNS,
// so the domain page shows each Instantly inbox's status and warmup numbers.
// Docs: https://developer.instantly.ai/api-reference/account/list-account
//       https://developer.instantly.ai/api-reference/account/get-warmup-analytics
// Needs the accounts:read scope on the API key.

const ACCOUNT_STATUS: Record<number, string> = {
  1: "Active",
  2: "Paused",
  3: "Paused for maintenance",
  [-1]: "Connection error",
  [-2]: "Soft bounce error",
  [-3]: "Sending error",
};
const WARMUP_STATUS: Record<number, string> = {
  1: "Warming",
  0: "Warmup paused",
  [-1]: "Banned",
  [-2]: "Spam folder unknown",
  [-3]: "Permanently suspended",
};

export type InboxHealth = {
  email: string;
  status: string;
  healthy: boolean;
  warmup: string;
  dailyLimit: number | null;
  sent: number | null;
  inbox: number | null;
  spam: number | null;
  inboxRate: number | null; // landed_inbox / (landed_inbox + landed_spam)
  healthScore: number | null;
};

async function instantly(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${process.env.INSTANTLY_API_KEY}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Instantly ${path} failed (${res.status}): ${body?.message ?? body?.error ?? "no details"}`);
  return body;
}

/** Every sending inbox with its status and warmup inbox-vs-spam numbers. */
export async function inboxHealth(): Promise<InboxHealth[]> {
  const accounts: { email: string; status?: number; warmup_status?: number; daily_limit?: number | null }[] = [];
  let cursor: string | undefined;
  do {
    const page = await instantly(`/accounts?limit=100${cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ""}`);
    accounts.push(...(page.items ?? []));
    cursor = page.next_starting_after ?? undefined;
  } while (cursor && accounts.length < 500);

  const stats: Record<string, { sent?: number; landed_inbox?: number; landed_spam?: number; health_score?: number }> = {};
  for (let i = 0; i < accounts.length; i += 100) {
    const emails = accounts.slice(i, i + 100).map((a) => a.email);
    if (!emails.length) continue;
    const a = await instantly("/accounts/warmup-analytics", { method: "POST", body: JSON.stringify({ emails }) });
    Object.assign(stats, a.aggregate_data ?? {});
  }

  return accounts.map((a) => {
    const s = stats[a.email] ?? {};
    const inbox = s.landed_inbox ?? null;
    const spam = s.landed_spam ?? null;
    return {
      email: a.email,
      status: ACCOUNT_STATUS[a.status ?? 0] ?? "Unknown",
      healthy: a.status === 1 && a.warmup_status === 1,
      warmup: WARMUP_STATUS[a.warmup_status ?? 99] ?? "Unknown",
      dailyLimit: a.daily_limit ?? null,
      sent: s.sent ?? null,
      inbox,
      spam,
      inboxRate: inbox !== null && spam !== null && inbox + spam > 0 ? inbox / (inbox + spam) : null,
      healthScore: typeof s.health_score === "number" ? s.health_score : null,
    };
  });
}
