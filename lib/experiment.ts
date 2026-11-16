// A/B group assignment for the opener experiment.
//
// Each new lead goes to whichever group is smaller right now, and a coin flip
// breaks ties. A plain coin flip per lead sounds fairer, but at small numbers
// it drifts: our first 25 leads came out 16 to 10, which makes the reply-rate
// comparison in Part C weaker. Filling the smaller group keeps the split
// within one lead of 50/50.
//
// The lead still has no say in its group (it doesn't depend on who the lead
// is), which is what keeps the comparison fair.

export type Group = "A" | "B";

export function pickGroup(counts: Record<Group, number>, coin = Math.random()): Group {
  if (counts.A < counts.B) return "A";
  if (counts.B < counts.A) return "B";
  return coin < 0.5 ? "A" : "B";
}
