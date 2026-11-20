// Warm intros and work-queue priority. No database code here, on purpose:
// these are pure functions of the lead and the connections, so they're easy
// to test and easy to argue about.
//
// The idea: before going cold, look at every lead through the team's and
// customers' relationships. Whoever knows the person best reaches out. Only
// when there's no warm path does the lead get normal routing.

import { AES } from "./routing";

export type ConnectionKind = "rep" | "customer" | "past_champion";

export type Connection = {
  owner: string; // the rep who knows them, or the customer's name
  kind: ConnectionKind;
  person_name: string;
  company: string;
  title: string | null;
  strength: number; // 0 none, 1 connected only, 2 know each other, 3 worked together / talk often
};

export type WarmPathKind = "knows_lead" | "knows_colleague" | "customer_intro" | "past_champion";

export type WarmPath = {
  kind: WarmPathKind;
  owner: string; // who has the relationship
  via: string; // the person they know
  strength: number;
};

const norm = (s: string) => s.trim().toLowerCase();

/**
 * The best warm path to a lead, or null when there's none.
 * Order: knowing the lead themself beats knowing a colleague; then the
 * stronger relationship; then a rep beats a past champion beats a customer
 * (asking a customer for a favour is the most expensive path).
 */
export function bestWarmPath(lead: { name: string; company: string }, connections: Connection[]): WarmPath | null {
  const kindRank: Record<ConnectionKind, number> = { rep: 3, past_champion: 2, customer: 1 };
  const candidates = connections
    .filter((c) => c.strength > 0 && norm(c.company) === norm(lead.company))
    .map((c) => {
      const isLead = norm(c.person_name) === norm(lead.name);
      const kind: WarmPathKind =
        c.kind === "customer" ? "customer_intro" : c.kind === "past_champion" ? "past_champion" : isLead ? "knows_lead" : "knows_colleague";
      return { path: { kind, owner: c.owner, via: c.person_name, strength: c.strength }, isLead, rank: kindRank[c.kind] };
    })
    .sort((a, b) => Number(b.isLead) - Number(a.isLead) || b.path.strength - a.path.strength || b.rank - a.rank);
  return candidates[0]?.path ?? null;
}

/**
 * When a warm path should override load balancing: a rep (an AE on the
 * team) who knows the lead or a colleague at least "know each other" well.
 * Returns the AE's name, or null to fall back to normal routing.
 */
export function warmOwner(path: WarmPath | null): string | null {
  if (!path || path.strength < 2) return null;
  if (path.kind !== "knows_lead" && path.kind !== "knows_colleague" && path.kind !== "past_champion") return null;
  return AES.some((ae) => ae.name === path.owner) ? path.owner : null;
}

// The SDR who pairs with an AE on the very best leads. A sample name, like the AEs.
export const SDRS = ["Riley Brooks"];
export const PAIR_SCORE = 90;

/** Score 90+ with a warm path gets an SDR + AE pair; returns the SDR or null. */
export function pairSdr(score: number | null, path: WarmPath | null): string | null {
  return score !== null && score >= PAIR_SCORE && path ? SDRS[0] : null;
}

const WARM_BONUS: Record<WarmPathKind, number[]> = {
  // bonus by strength 0..3
  knows_lead: [0, 8, 18, 25],
  knows_colleague: [0, 5, 12, 18],
  past_champion: [0, 8, 15, 22],
  customer_intro: [0, 6, 12, 15],
};
export const SIGNAL_BONUS = 10;

/**
 * Work-queue order: the fit score, plus a bump for a timely signal, plus a
 * bump for a warm path. A 75 with a strong warm path outranks a cold 90,
 * because a reply is far more likely.
 */
export function priority(score: number | null, signal: string | null, path: WarmPath | null): number {
  const base = score ?? 0;
  const s = signal && signal.trim() ? SIGNAL_BONUS : 0;
  const w = path ? (WARM_BONUS[path.kind][Math.max(0, Math.min(3, path.strength))] ?? 0) : 0;
  return base + s + w;
}

/** One line a rep can read: who reaches out, through whom. */
export function describeWarmPath(path: WarmPath, company: string): string {
  const first = path.owner.split(" ")[0];
  switch (path.kind) {
    case "knows_lead":
      return `${first} knows them directly (strength ${path.strength}).`;
    case "knows_colleague":
      return `${first} knows ${path.via} at ${company} (strength ${path.strength}); ask for an intro.`;
    case "past_champion":
      return `${path.via} was a champion at a past customer and knows ${first}.`;
    case "customer_intro":
      return `Customer ${path.owner} knows ${path.via} at ${company}; ask them for a forwarded intro.`;
  }
}
