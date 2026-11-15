// The brain of the Domain Health Checker.
//
// It asks the public DNS system four questions about a domain and turns the
// answers into pass / warn / fail results with a plain-English fix for each.
//
// DNS is the internet's phone book: a set of public records every domain
// publishes. Nothing here is private data, and no email is ever sent.

import { Resolver } from "node:dns/promises";

export type Status = "pass" | "warn" | "fail" | "unknown";

export type Check = {
  id: "mx" | "spf" | "dkim" | "dmarc";
  name: string;
  /** One sentence on what this record is. */
  what: string;
  status: Status;
  /** What we found, in plain English. */
  summary: string;
  /** What to do about it. Null when nothing needs fixing. */
  fix: string | null;
  /** The raw DNS records, shown as evidence. */
  records: string[];
};

export type Report = {
  domain: string;
  grade: "A" | "B" | "C" | "D" | "F";
  score: number;
  headline: string;
  checks: Check[];
  checkedAt: string;
};

// How much each check counts toward the score. DMARC weighs the most because
// Gmail and Yahoo require it for bulk senders, and it only works when SPF or
// DKIM is in place.
const WEIGHTS: Record<Check["id"], number> = { mx: 20, spf: 25, dkim: 25, dmarc: 30 };

// DKIM records live at "<selector>._domainkey.<domain>", and the selector is
// a name each email provider picks. There is no way to list them all, so we
// try the ones the big providers use.
const DKIM_SELECTORS = [
  "google", // Google Workspace
  "selector1", // Microsoft 365
  "selector2", // Microsoft 365
  "k1", // Mailchimp / Mandrill
  "k2",
  "k3",
  "default",
  "s1", // SendGrid
  "s2", // SendGrid
  "dkim",
  "mail",
  "smtp",
  "mandrill",
  "pm", // Postmark
  "resend", // Resend
  "hs1", // HubSpot
  "hs2", // HubSpot
  "fm1", // Fastmail
  "protonmail", // Proton
  "zoho", // Zoho
  "mxvault", // MXRoute
  "kl", // Klaviyo
  "kl2", // Klaviyo
];

const MAIL_PROVIDERS: [RegExp, string][] = [
  [/google\.com$|googlemail\.com$/, "Google Workspace"],
  [/outlook\.com$|microsoft\.com$/, "Microsoft 365"],
  [/zoho\./, "Zoho Mail"],
  [/protonmail\.ch$|proton\.me$/, "Proton Mail"],
  [/messagingengine\.com$/, "Fastmail"],
  [/pphosted\.com$/, "Proofpoint"],
  [/mimecast\.com$/, "Mimecast"],
  [/amazonaws\.com$/, "Amazon SES"],
  [/cloudflare\.net$/, "Cloudflare Email Routing"],
];

/**
 * Turns whatever the person typed ("https://www.Example.com/about",
 * "ana@example.com") into a bare domain ("example.com"), or null if it
 * doesn't look like a domain at all.
 */
export function cleanDomain(input: string): string | null {
  let d = input.trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, ""); // drop "https://"
  d = d.split(/[/?#]/)[0]; // drop any path
  if (d.includes("@")) d = d.split("@").pop() ?? ""; // email -> its domain
  d = d.replace(/:\d+$/, "").replace(/^www\./, "").replace(/\.$/, "");
  const valid =
    d.length <= 253 &&
    /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d);
  return valid ? d : null;
}

function makeResolver() {
  // Ask Cloudflare's and Google's public DNS servers directly, so results
  // are the same on a laptop and on Vercel.
  const resolver = new Resolver({ timeout: 3000, tries: 2 });
  resolver.setServers(["1.1.1.1", "8.8.8.8"]);
  return resolver;
}

/** "Record doesn't exist" is a normal answer, not an error. */
function isMissing(err: unknown) {
  const code = (err as { code?: string })?.code;
  return code === "ENODATA" || code === "ENOTFOUND";
}

/** Look up TXT records. Returns [] when there are none. */
async function txt(resolver: Resolver, name: string): Promise<string[]> {
  try {
    const rows = await resolver.resolveTxt(name);
    // Long TXT records arrive split into chunks; glue them back together.
    return rows.map((chunks) => chunks.join(""));
  } catch (err) {
    if (isMissing(err)) return [];
    throw err;
  }
}

async function checkMx(resolver: Resolver, domain: string): Promise<Check> {
  const base = {
    id: "mx" as const,
    name: "MX",
    what: "MX records say which servers receive email for this domain.",
  };
  let rows: { exchange: string; priority: number }[] = [];
  try {
    rows = await resolver.resolveMx(domain);
  } catch (err) {
    if (!isMissing(err)) throw err;
  }
  rows.sort((a, b) => a.priority - b.priority);
  const records = rows.map((r) => `${r.priority} ${r.exchange || "."}`);

  if (rows.length === 0) {
    return {
      ...base,
      status: "fail",
      summary: "No MX records. This domain can't receive email, so replies and bounces go nowhere.",
      fix: "Add the MX records your email provider gives you (Google Workspace and Microsoft 365 both list them in their setup guides).",
      records,
    };
  }
  if (rows.every((r) => r.exchange === "" || r.exchange === ".")) {
    return {
      ...base,
      status: "fail",
      summary: "This domain publishes a \"null MX\", which tells the world it does not accept email at all.",
      fix: "If you plan to send from this domain, replace the null MX with your email provider's MX records so replies can reach you.",
      records,
    };
  }
  const provider = MAIL_PROVIDERS.find(([re]) => rows.some((r) => re.test(r.exchange)))?.[1];
  return {
    ...base,
    status: "pass",
    summary: provider
      ? `Mail is received by ${provider}. Replies and bounces have somewhere to land.`
      : `${rows.length} mail server${rows.length > 1 ? "s" : ""} found. Replies and bounces have somewhere to land.`,
    fix: null,
    records,
  };
}

async function checkSpf(resolver: Resolver, domain: string): Promise<Check> {
  const base = {
    id: "spf" as const,
    name: "SPF",
    what: "SPF lists which servers are allowed to send email for this domain.",
  };
  const records = (await txt(resolver, domain)).filter((r) => /^v=spf1(\s|$)/i.test(r));

  if (records.length === 0) {
    return {
      ...base,
      status: "fail",
      summary: "No SPF record. Inboxes can't tell your real senders from someone faking your domain.",
      fix: "Add one TXT record on the domain that starts with v=spf1, includes your email provider (for Google: include:_spf.google.com) and ends with ~all.",
      records,
    };
  }
  if (records.length > 1) {
    return {
      ...base,
      status: "fail",
      summary: `Found ${records.length} SPF records. A domain may only have one, so inboxes treat this as an error and SPF fails.`,
      fix: "Merge them into a single v=spf1 record that lists every sender, then delete the extras.",
      records,
    };
  }

  const terms = records[0].split(/\s+/).slice(1);
  const all = terms.find((t) => /^[+\-~?]?all$/i.test(t));
  const hasRedirect = terms.some((t) => /^redirect=/i.test(t));
  // SPF allows at most 10 lookups of other records. We count the ones in
  // this record; records it includes can add more.
  const lookups = terms.filter((t) => /^[+\-~?]?(include:|a(:|\/|$)|mx(:|\/|$)|exists:|ptr|redirect=)/i.test(t)).length;

  if (all && /^\+?all$/i.test(all)) {
    return {
      ...base,
      status: "fail",
      summary: "The record ends with +all, which allows every server on the internet to send as this domain.",
      fix: "Change +all to ~all (or -all once you're sure every sender is listed).",
      records,
    };
  }
  if (lookups > 10) {
    return {
      ...base,
      status: "warn",
      summary: `The record needs ${lookups} DNS lookups, and SPF stops working past 10.`,
      fix: "Remove include: entries for tools you no longer send from, or move some senders to a subdomain.",
      records,
    };
  }
  if (all && /^\?all$/i.test(all)) {
    return {
      ...base,
      status: "warn",
      summary: "The record ends with ?all, which means \"no opinion\" about servers that aren't listed. That gives inboxes nothing to act on.",
      fix: "Change ?all to ~all so unlisted senders are treated as suspicious.",
      records,
    };
  }
  if (!all && !hasRedirect) {
    return {
      ...base,
      status: "warn",
      summary: "The record lists senders but never says what to do with everyone else.",
      fix: "Add ~all to the end of the record.",
      records,
    };
  }
  const strict = all?.startsWith("-");
  return {
    ...base,
    status: "pass",
    summary: hasRedirect && !all
      ? "One valid SPF record, handed off to the email provider's own policy."
      : strict
        ? "One valid SPF record with a strict ending (-all): mail from unlisted servers is rejected."
        : "One valid SPF record ending in ~all: mail from unlisted servers is marked suspicious.",
    fix: null,
    records,
  };
}

async function checkDmarc(resolver: Resolver, domain: string): Promise<Check> {
  const base = {
    id: "dmarc" as const,
    name: "DMARC",
    what: "DMARC tells inboxes what to do with email that fails SPF and DKIM, and where to send reports.",
  };
  const records = (await txt(resolver, `_dmarc.${domain}`)).filter((r) => /^v=dmarc1/i.test(r));

  if (records.length === 0) {
    return {
      ...base,
      status: "fail",
      summary: "No DMARC record. Gmail and Yahoo require one from anyone sending in volume, so outbound from this domain is likely to hit spam.",
      fix: `Add a TXT record at _dmarc.${domain} with: v=DMARC1; p=none; rua=mailto:dmarc@${domain}. Watch the reports for two weeks, then tighten to p=quarantine.`,
      records,
    };
  }
  if (records.length > 1) {
    return {
      ...base,
      status: "fail",
      summary: `Found ${records.length} DMARC records. Only one is allowed, so inboxes ignore all of them.`,
      fix: `Keep one record at _dmarc.${domain} and delete the rest.`,
      records,
    };
  }

  const tags = new Map(
    records[0].split(";").map((part) => {
      const [k, ...v] = part.split("=");
      return [k.trim().toLowerCase(), v.join("=").trim()] as const;
    }),
  );
  const policy = (tags.get("p") ?? "").toLowerCase();
  const hasReports = tags.has("rua");
  const pct = Number(tags.get("pct") ?? "100");

  if (!["none", "quarantine", "reject"].includes(policy)) {
    return {
      ...base,
      status: "fail",
      summary: "The DMARC record has no valid policy (p=), so inboxes ignore it.",
      fix: "Set p=none, p=quarantine or p=reject in the record.",
      records,
    };
  }
  if (policy === "none") {
    return {
      ...base,
      status: "warn",
      summary: hasReports
        ? "DMARC is in monitor-only mode (p=none). It collects reports but doesn't stop anyone faking this domain."
        : "DMARC is in monitor-only mode (p=none) with no report address, so it currently does nothing.",
      fix: hasReports
        ? "Once the reports show only your own senders, change p=none to p=quarantine."
        : `Add rua=mailto:dmarc@${domain} to start getting reports, then move to p=quarantine.`,
      records,
    };
  }
  if (pct < 100) {
    return {
      ...base,
      status: "warn",
      summary: `Policy is ${policy}, but only applied to ${pct}% of failing mail (pct=${pct}).`,
      fix: "Raise pct to 100 once you're confident real mail is passing.",
      records,
    };
  }
  return {
    ...base,
    status: "pass",
    summary:
      (policy === "reject"
        ? "Strongest policy (p=reject): email faking this domain is refused."
        : "Enforced policy (p=quarantine): email faking this domain goes to spam.") +
      (hasReports ? "" : " No report address is set, so you won't see who is sending as you."),
    fix: null,
    records,
  };
}

async function checkDkim(resolver: Resolver, domain: string): Promise<Check> {
  const base = {
    id: "dkim" as const,
    name: "DKIM",
    what: "DKIM is a digital signature on each email that proves it wasn't forged or altered.",
  };
  const lookups = await Promise.all(
    DKIM_SELECTORS.map(async (selector) => {
      try {
        const rows = await txt(resolver, `${selector}._domainkey.${domain}`);
        const key = rows.find((r) => /(^|;)\s*p=/i.test(r) || /^v=dkim1/i.test(r));
        return key ? { selector, key } : null;
      } catch {
        return null; // one flaky lookup shouldn't sink the whole check
      }
    }),
  );
  const found = lookups.filter((x) => x !== null);
  const live = found.filter((f) => /(^|;)\s*p=[^;\s]/i.test(f.key));
  // Keys are long; trim them so the evidence stays readable.
  const records = found.map((f) => `${f.selector}._domainkey  ${f.key.length > 90 ? f.key.slice(0, 90) + "…" : f.key}`);

  if (found.length === 0) {
    return {
      ...base,
      status: "unknown",
      summary: `No DKIM key at the ${DKIM_SELECTORS.length} most common selectors. DKIM names are chosen by each email tool and can't be listed from outside, so this isn't proof it's missing.`,
      fix: "Send yourself an email from this domain, open \"Show original\" in Gmail, and look for DKIM: PASS. If it isn't there, turn on DKIM in your email provider's admin settings.",
      records,
    };
  }
  if (live.length === 0) {
    return {
      ...base,
      status: "fail",
      summary: "A DKIM record exists but its key is empty, which means it was switched off.",
      fix: "Generate a new DKIM key in your email provider's admin settings and publish it.",
      records,
    };
  }
  return {
    ...base,
    status: "pass",
    summary: `Signing key found (selector${live.length > 1 ? "s" : ""}: ${live.map((f) => f.selector).join(", ")}). Email from this domain can be signed.`,
    fix: null,
    records,
  };
}

function gradeFor(score: number): Report["grade"] {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

const HEADLINES: Record<Report["grade"], string> = {
  A: "Ready for outbound. The basics inboxes look for are all in place.",
  B: "Close. One gap to fix before sending in volume.",
  C: "Risky. Outbound from this domain will land in spam more often than it should.",
  D: "Not ready. Fix the items below before sending anything.",
  F: "Not set up for email. Sending outbound from this domain would hurt it.",
};

export async function checkDomain(domain: string): Promise<Report> {
  const resolver = makeResolver();
  // Run all four lookups at the same time instead of one after another.
  const checks = await Promise.all([
    checkMx(resolver, domain),
    checkSpf(resolver, domain),
    checkDkim(resolver, domain),
    checkDmarc(resolver, domain),
  ]);

  // pass = full points, warn = half, fail = zero. A check we couldn't verify
  // ("unknown") is left out of the math instead of being counted against you.
  let earned = 0;
  let possible = 0;
  for (const c of checks) {
    if (c.status === "unknown") continue;
    possible += WEIGHTS[c.id];
    earned += WEIGHTS[c.id] * (c.status === "pass" ? 1 : c.status === "warn" ? 0.5 : 0);
  }
  const score = possible === 0 ? 0 : Math.round((earned / possible) * 100);
  const grade = gradeFor(score);

  return {
    domain,
    grade,
    score,
    headline: HEADLINES[grade],
    checks,
    checkedAt: new Date().toISOString(),
  };
}
