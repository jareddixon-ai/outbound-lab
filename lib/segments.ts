// Segments for the experiment. "B wins overall" can hide "A wins with
// founders and B wins with VPs", so Part C breaks reply rates down by who
// the lead is. Pure functions, tested in tests/segments.test.ts.

import type { GroupCounts } from "./stats";

/** Title -> seniority level. Order matters: "VP of Growth" is a VP, not "growth". */
export function titleLevel(title: string | null): string {
  const t = (title ?? "").toLowerCase();
  if (!t) return "Unknown";
  if (/\b(chief|ceo|cmo|coo|cfo|cto|founder|co-founder|owner|president|partner)\b/.test(t)) return "Exec / founder";
  if (/\b(vp|svp|evp|vice president)\b/.test(t)) return "VP";
  if (/\b(head|director)\b/.test(t)) return "Head / director";
  if (/\b(manager|lead)\b/.test(t)) return "Manager / lead";
  return "Individual contributor";
}

/** Employee count -> size band. */
export function sizeBand(employees: number | null): string {
  if (employees === null || employees === undefined) return "Unknown";
  if (employees < 50) return "1–49";
  if (employees < 250) return "50–249";
  if (employees < 1000) return "250–999";
  return "1,000+";
}

/** Fit score -> band, to check whether high scores really reply more. */
export function scoreBand(score: number | null): string {
  if (score === null) return "Unscored";
  if (score >= 80) return "80–100";
  if (score >= 50) return "50–79";
  if (score >= 20) return "20–49";
  return "0–19";
}

export type SegmentLead = {
  experiment_group: string | null;
  replied: boolean;
  positive_reply?: boolean;
};

export type SegmentRow = {
  segment: string;
  A: GroupCounts;
  B: GroupCounts;
  leads: number;
  replies: number;
  positive: number;
};

/** Reply counts per segment and A/B group, sorted by number of leads. */
export function segmentTable<T extends SegmentLead>(leads: T[], key: (l: T) => string): SegmentRow[] {
  const rows = new Map<string, SegmentRow>();
  for (const l of leads) {
    const seg = key(l);
    const row =
      rows.get(seg) ??
      { segment: seg, A: { leads: 0, replies: 0 }, B: { leads: 0, replies: 0 }, leads: 0, replies: 0, positive: 0 };
    row.leads += 1;
    if (l.replied) row.replies += 1;
    if (l.positive_reply) row.positive += 1;
    if (l.experiment_group === "A" || l.experiment_group === "B") {
      row[l.experiment_group].leads += 1;
      if (l.replied) row[l.experiment_group].replies += 1;
    }
    rows.set(seg, row);
  }
  return [...rows.values()].sort((a, b) => b.leads - a.leads);
}
