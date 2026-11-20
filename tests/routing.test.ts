import { describe, expect, it } from "vitest";
import { AES, HOT_SCORE, chooseOwner, eligibleAes } from "../lib/routing";

const counts = (maya: number, jordan: number, sam: number) => ({
  "Maya Chen": maya,
  "Jordan Patel": jordan,
  "Sam Rivera": sam,
});

describe("routing", () => {
  it("lets every AE take a hot lead, and only non-senior AEs take the rest", () => {
    expect(eligibleAes(HOT_SCORE).map((a) => a.name)).toEqual(AES.map((a) => a.name));
    expect(eligibleAes(HOT_SCORE - 1).every((a) => !a.senior)).toBe(true);
    expect(eligibleAes(null).every((a) => !a.senior)).toBe(true);
  });

  it("gives a hot lead to whoever has the fewest leads", () => {
    expect(chooseOwner(90, counts(5, 2, 4)).owner).toBe("Jordan Patel");
  });

  it("breaks a tie on a hot lead in favour of the senior AE (listed first)", () => {
    expect(chooseOwner(85, counts(3, 3, 3)).owner).toBe("Maya Chen");
  });

  it("never gives a cold lead to the senior AE, even when she has the fewest", () => {
    expect(chooseOwner(40, counts(0, 6, 5)).owner).toBe("Sam Rivera");
  });

  it("treats a missing score like a cold lead and says why", () => {
    const d = chooseOwner(null, counts(0, 1, 2));
    expect(d.owner).toBe("Jordan Patel");
    expect(d.reason).toMatch(/No score/);
  });

  it("puts the counts it used in the reason", () => {
    expect(chooseOwner(79, counts(1, 2, 3)).reason).toContain("Jordan 2, Sam 3");
  });
});
