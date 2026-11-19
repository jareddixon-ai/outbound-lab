// Part C: is opener style A or B getting more replies, and is the gap real?
//
// A "two-proportion z-test" answers: if A and B were truly equally good,
// how likely is a gap this big just by luck? That chance is the p-value.
// Small p-value (under 0.05) = the gap is probably real.
// Big p-value = it could easily be luck; keep sending.

export type GroupCounts = { leads: number; replies: number };

export type Verdict = {
  kind: "winner" | "no_difference" | "too_early";
  headline: string; // e.g. "B is winning"
  detail: string; // one plain sentence explaining why
};

export type TestResult = {
  rateA: number; // 0..1
  rateB: number;
  gap: number; // rateB - rateA, in 0..1 units
  z: number;
  pValue: number;
  verdict: Verdict;
};

// Standard normal cumulative distribution, via the error function
// (Abramowitz & Stegun 7.1.26, accurate to about 1e-7).
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(x) / Math.SQRT2));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

export function twoProportionTest(a: GroupCounts, b: GroupCounts): TestResult {
  const rateA = a.leads ? a.replies / a.leads : 0;
  const rateB = b.leads ? b.replies / b.leads : 0;
  const total = a.leads + b.leads;
  const pooled = total ? (a.replies + b.replies) / total : 0;
  const se = a.leads && b.leads ? Math.sqrt(pooled * (1 - pooled) * (1 / a.leads + 1 / b.leads)) : 0;
  const z = se > 0 ? (rateB - rateA) / se : 0;
  const pValue = se > 0 ? 2 * (1 - normalCdf(Math.abs(z))) : 1;
  return { rateA, rateB, gap: rateB - rateA, z, pValue, verdict: decideVerdict(a, b, rateA, rateB, pValue) };
}

// Below this many leads in a group, we won't call a winner at all.
export const MIN_LEADS_PER_GROUP = 30;

/**
 * Turns the numbers into what a sales manager reads: who's winning, or
 * that it's too early to say.
 */
export function decideVerdict(
  a: GroupCounts,
  b: GroupCounts,
  rateA: number,
  rateB: number,
  pValue: number,
): Verdict {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

  // 1. Too little data: refuse to call it, whatever the rates say.
  if (a.leads < MIN_LEADS_PER_GROUP || b.leads < MIN_LEADS_PER_GROUP) {
    const need = Math.max(0, MIN_LEADS_PER_GROUP - Math.min(a.leads, b.leads));
    return {
      kind: "too_early",
      headline: "Too early to tell",
      detail: `Each group needs at least ${MIN_LEADS_PER_GROUP} leads before we judge; the smaller one needs ${need} more.`,
    };
  }

  // 2. Gap unlikely to be luck (under a 5% chance): call the winner.
  if (pValue < SIGNIFICANCE) {
    const [win, lose] = rateB > rateA ? (["B", "A"] as const) : (["A", "B"] as const);
    const [w, l] = win === "B" ? [rateB, rateA] : [rateA, rateB];
    return {
      kind: "winner",
      headline: `${win} is winning`,
      detail: `Group ${win} replies at ${pct(w)} vs ${pct(l)} for ${lose}, and a gap this big would happen by luck only ${(pValue * 100).toFixed(1)}% of the time.`,
    };
  }

  // 3. Enough data, but the gap could easily be luck.
  return {
    kind: "no_difference",
    headline: "No clear winner yet",
    detail: `A replies at ${pct(rateA)} and B at ${pct(rateB)}, but a gap this size happens by luck ${(pValue * 100).toFixed(0)}% of the time. Keep sending both.`,
  };
}

// The usual bar: a gap that luck would produce less than 5% of the time.
export const SIGNIFICANCE = 0.05;
