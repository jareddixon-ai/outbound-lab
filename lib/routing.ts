// Lead routing: decide which AE (account executive) owns each lead.
//
// The rules, in order:
// 1. Score 80 or more  -> the senior AE, so the hottest leads get the most
//    experienced closer.
// 2. Everything else    -> round robin between the other AEs. "Round robin"
//    here means whoever currently has the fewest round-robin leads gets the
//    next one, so the split stays even even if a lead is deleted.
// 3. No score (Claude failed) -> round robin too, flagged for a human to check.
//
// This file has no database code in it on purpose: the decision is a pure
// function of the score and the current counts, which makes it easy to test.

export type AE = { name: string; senior: boolean };

// Sample AEs for the demo. In real life this would come from Salesforce users.
export const AES: AE[] = [
  { name: "Maya Chen", senior: true },
  { name: "Jordan Patel", senior: false },
  { name: "Sam Rivera", senior: false },
];

export const HOT_SCORE = 80;

export type RoutingDecision = { owner: string; reason: string };

/**
 * @param score     Claude's fit score, or null if scoring failed
 * @param rrCounts  how many round-robin leads each AE already has
 */
export function chooseOwner(score: number | null, rrCounts: Record<string, number>): RoutingDecision {
  const senior = AES.find((ae) => ae.senior)!;

  if (score !== null && score >= HOT_SCORE) {
    return {
      owner: senior.name,
      reason: `Score ${score} is ${HOT_SCORE} or more, so it goes to the senior AE.`,
    };
  }

  const pool = AES.filter((ae) => !ae.senior);
  // Fewest leads first; ties go to whoever is listed first.
  const next = pool.reduce((best, ae) =>
    (rrCounts[ae.name] ?? 0) < (rrCounts[best.name] ?? 0) ? ae : best,
  );
  const counts = pool.map((ae) => `${ae.name.split(" ")[0]} ${rrCounts[ae.name] ?? 0}`).join(", ");

  return {
    owner: next.name,
    reason:
      score === null
        ? `No score (Claude step failed), so round robin. It was ${next.name.split(" ")[0]}'s turn (${counts}).`
        : `Score ${score} is under ${HOT_SCORE}, so round robin. It was ${next.name.split(" ")[0]}'s turn (${counts}).`,
  };
}
