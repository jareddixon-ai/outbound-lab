// The Salesforce step: turn a finished lead into a Salesforce Lead record.
//
// How our app gets permission (OAuth "client credentials"):
// 1. In Salesforce we create an app entry that gives us a Client ID and a
//    Client Secret (a username and password for code, not for a person).
// 2. Our app trades those for a short-lived "access token" (a day pass).
// 3. Every request to Salesforce carries that token.
// Nobody's real Salesforce password is ever stored in this app.

type Token = { accessToken: string; instanceUrl: string; expiresAt: number };

let cached: Token | null = null;

const API_VERSION = "v62.0";

/** True when all three Salesforce settings are present. */
export function salesforceConfigured(): boolean {
  return Boolean(process.env.SF_LOGIN_URL && process.env.SF_CLIENT_ID && process.env.SF_CLIENT_SECRET);
}

async function getToken(): Promise<Token> {
  if (cached && cached.expiresAt > Date.now()) return cached;

  // SF_LOGIN_URL is your org's own address, e.g. https://yourname-dev-ed.develop.my.salesforce.com
  const loginUrl = process.env.SF_LOGIN_URL!.replace(/\/+$/, "");
  const res = await fetch(`${loginUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.SF_CLIENT_ID!,
      client_secret: process.env.SF_CLIENT_SECRET!,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(
      `Salesforce login failed (${res.status}): ${body.error_description ?? body.error ?? "no details"}`,
    );
  }

  // Salesforce doesn't say when the token expires, so we refresh it after
  // 30 minutes to be safe. A 401 below also forces a refresh.
  cached = {
    accessToken: body.access_token,
    instanceUrl: body.instance_url ?? loginUrl,
    expiresAt: Date.now() + 30 * 60 * 1000,
  };
  return cached;
}

export type LeadForSalesforce = {
  name: string;
  title: string | null;
  company: string;
  domain: string | null;
  industry: string | null;
  employee_count: number | null;
  score: number | null;
  score_reason: string | null;
  opener: string | null;
  owner: string | null;
  routing_reason: string | null;
  experiment_group: string | null;
};

function toSalesforceFields(lead: LeadForSalesforce) {
  // Salesforce requires LastName and Company. Split "Ana Ruiz" into first/last.
  const parts = lead.name.trim().split(/\s+/);
  const lastName = parts.length > 1 ? parts.pop()! : parts[0];
  const firstName = parts.length > 0 && parts.join(" ") !== lastName ? parts.join(" ") : undefined;

  return {
    FirstName: firstName,
    LastName: lastName,
    Company: lead.company,
    Title: lead.title ?? undefined,
    Website: lead.domain ?? undefined,
    Industry: lead.industry ?? undefined,
    NumberOfEmployees: lead.employee_count ?? undefined,
    LeadSource: "Outbound Lab",
    Description: [
      lead.score_reason && `Why this score: ${lead.score_reason}`,
      lead.routing_reason && `Why this owner: ${lead.routing_reason}`,
    ]
      .filter(Boolean)
      .join("\n"),
    // Custom fields we add in Salesforce Setup (the __c means "custom").
    Fit_Score__c: lead.score ?? undefined,
    Opener__c: lead.opener ?? undefined,
    Experiment_Group__c: lead.experiment_group ?? undefined,
    Assigned_AE__c: lead.owner ?? undefined,
  };
}

/**
 * When Salesforce's duplicate rule blocks a new Lead, its error lists the
 * existing records it matched. Returns the first matching record's Id, or
 * null when the error isn't a duplicate.
 */
export function duplicateMatchId(body: unknown): string | null {
  if (!Array.isArray(body)) return null;
  for (const e of body as { errorCode?: string; duplicateResult?: { matchResults?: { matchRecords?: { record?: { Id?: string } }[] }[] } }[]) {
    if (e?.errorCode !== "DUPLICATES_DETECTED") continue;
    for (const r of e.duplicateResult?.matchResults ?? []) {
      const id = r.matchRecords?.find((m) => m.record?.Id)?.record?.Id;
      if (id) return id;
    }
  }
  return null;
}

export type SalesforceResult = { id: string; matched: boolean };

/**
 * Creates the Lead in Salesforce and returns its Id. v2: if Salesforce says
 * this person already exists, link to that record instead of failing (and
 * don't overwrite it), so a re-run never makes a second copy.
 */
export async function createSalesforceLead(lead: LeadForSalesforce): Promise<SalesforceResult> {
  const send = async (token: Token) =>
    fetch(`${token.instanceUrl}/services/data/${API_VERSION}/sobjects/Lead`, {
      method: "POST",
      headers: { authorization: `Bearer ${token.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify(toSalesforceFields(lead)),
    });

  let res = await send(await getToken());
  if (res.status === 401) {
    cached = null; // the day pass expired; get a new one and try once more
    res = await send(await getToken());
  }

  const body = await res.json().catch(() => null);
  const existing = res.ok ? null : duplicateMatchId(body);
  if (existing) return { id: existing, matched: true };
  if (!res.ok || !body?.id) {
    // Salesforce returns a list of errors like [{message, errorCode, fields}].
    const detail = Array.isArray(body)
      ? body.map((e: { errorCode?: string; message?: string }) => `${e.errorCode}: ${e.message}`).join("; ")
      : JSON.stringify(body);
    throw new Error(`Salesforce rejected the Lead (${res.status}): ${detail}`);
  }
  return { id: body.id as string, matched: false };
}
