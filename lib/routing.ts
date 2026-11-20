// Lead routing: decide which AE (account executive) owns each lead.
//
// The rule: everyone gets an even share of leads, but only hot leads can go
// to the senior AE.
//
// - Hot lead (score 80 or more): any AE can take it. It goes to whoever has
//   the fewest leads right now. On a tie, the senior AE wins, so the most
//   experienced closer gets first pick of the best leads.
// - Everything else (including leads Claude couldn't score): only the
//   non-senior AEs can take it, again whoever has the fewest.
//
// Why not "every hot lead goes to the senior AE"? We tried that first. With
// a good lead list most leads are hot, so the senior AE got 14 of 26 leads
// and the other two got 6 each. Hot leads that sit in an overloaded inbox go
// cold, which defeats the point.
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

const first = (name: string) => name.split(" ")[0];

/** Which AEs may take a lead with this score. Hot leads: everyone. */
export function eligibleAes(score: number | null): AE[] {
  const hot = score !== null && score >= HOT_SCORE;
  return hot ? AES : AES.filter((ae) => !ae.senior);
}

/** The plain-English reason, given who got it and the counts at the time. */
export function explainRouting(score: number | null, owner: string, counts: Record<string, number>): string {
  const eligible = eligibleAes(score);
  const load = eligible.map((ae) => `${first(ae.name)} ${counts[ae.name] ?? 0}`).join(", ");
  const why =
    score === null
      ? "No score (Claude step failed), so it goes to a non-senior AE for review."
      : score >= HOT_SCORE
        ? `Score ${score} is ${HOT_SCORE} or more, so any AE can take it.`
        : `Score ${score} is under ${HOT_SCORE}, so it goes to a non-senior AE.`;
  return `${why} ${first(owner)} had the fewest leads (${load}).`;
}

/**
 * The whole decision in memory. v2 runs the "fewest leads" pick inside the
 * database (route_lead in supabase/v2_schema.sql) so it's atomic, using the
 * same rule; this version is what the tests check the rule against.
 *
 * @param score   Claude's fit score, or null if scoring failed
 * @param counts  how many leads each AE already owns
 */
export function chooseOwner(score: number | null, counts: Record<string, number>): RoutingDecision {
  // Fewest leads wins. Ties go to whoever is listed first, and the senior
  // AE is listed first, so she wins ties on hot leads.
  const owner = eligibleAes(score).reduce((best, ae) =>
    (counts[ae.name] ?? 0) < (counts[best.name] ?? 0) ? ae : best,
  );
  return { owner: owner.name, reason: explainRouting(score, owner.name, counts) };
}
