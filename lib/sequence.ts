// v2: the follow-up sequence. v1 wrote one opener per lead; a real
// sequence tries a different angle at each step, so a lead who ignores the
// first idea still hears the others.
//
// Step 1 is the A/B opener, so the experiment in Part C still measures the
// thing it was built to measure. Steps 2-5 are the same for everyone.

import type { Group } from "./experiment";

export type PlanStep = {
  step: number;
  /** Days after step 1 that this email goes out. */
  day: number;
  /** Short label shown on the pipeline page and sent to Instantly. */
  angle: string;
  /** What Claude is told to write for this step. */
  brief: string;
};

export type SequenceStep = PlanStep & { subject: string | null; body: string };

/** The other group's style, so step 2 gives every lead the angle they didn't get first. */
export const otherGroup = (g: Group): Group => (g === "A" ? "B" : "A");

export const SEQUENCE_PLAN: PlanStep[] = [
  {
    step: 1,
    day: 0,
    angle: "A/B opener",
    brief: "The first email, in the opener style you were given.",
  },
  {
    step: 2,
    day: 3,
    angle: "The other hook",
    brief: "A short follow-up using the OTHER opener style, so the lead hears both ideas.",
  },
  {
    step: 3,
    day: 7,
    angle: "Free teardown",
    brief:
      "Offer something useful for free: a 1-page teardown of how their brand could sell more through social commerce. No meeting ask; just ask if they want it.",
  },
  {
    step: 4,
    day: 12,
    angle: "Category insight",
    brief:
      "Share one general observation about what brands in their category are doing on social commerce. Never name a customer, a result or a number.",
  },
  {
    step: 5,
    day: 18,
    angle: "Break-up",
    brief: "A short, polite last email: say you'll stop reaching out and leave the door open.",
  },
];

/** Joins the plan with Claude's text into the stored sequence. */
export function buildSequence(subject: string, bodies: string[]): SequenceStep[] {
  if (bodies.length !== SEQUENCE_PLAN.length) {
    throw new Error(`Expected ${SEQUENCE_PLAN.length} email bodies, got ${bodies.length}.`);
  }
  return SEQUENCE_PLAN.map((p, i) => ({
    ...p,
    // Follow-ups reply in the same thread, so only step 1 has a subject.
    subject: i === 0 ? subject.trim() : null,
    body: bodies[i].trim(),
  }));
}
