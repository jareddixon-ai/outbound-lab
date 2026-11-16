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

/**
 * @param score   Claude's fit score, or null if scoring failed
 * @param counts  how many leads each AE already owns
 */
export function chooseOwner(score: number | null, counts: Record<string, number>): RoutingDecision {
  const hot = score !== null && score >= HOT_SCORE;
  const eligible = hot ? AES : AES.filter((ae) => !ae.senior);

  // Fewest leads wins. Ties go to whoever is listed first, and the senior
  // AE is listed first, so she wins ties on hot leads.
  const owner = eligible.reduce((best, ae) =>
    (counts[ae.name] ?? 0) < (counts[best.name] ?? 0) ? ae : best,
  );

  const load = eligible.map((ae) => `${first(ae.name)} ${counts[ae.name] ?? 0}`).join(", ");
  const why =
    score === null
      ? "No score (Claude step failed), so it goes to a non-senior AE for review."
      : hot
        ? `Score ${score} is ${HOT_SCORE} or more, so any AE can take it.`
        : `Score ${score} is under ${HOT_SCORE}, so it goes to a non-senior AE.`;

  return {
    owner: owner.name,
    reason: `${why} ${first(owner.name)} had the fewest leads (${load}).`,
  };
}
