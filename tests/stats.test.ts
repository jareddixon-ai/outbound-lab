import { describe, expect, it } from "vitest";
import { MIN_LEADS_PER_GROUP, twoProportionTest } from "../lib/stats";

describe("two-proportion test", () => {
  it("calls a real gap: 4/40 vs 12/40 is p ≈ 0.025, B wins", () => {
    const r = twoProportionTest({ leads: 40, replies: 4 }, { leads: 40, replies: 12 });
    expect(r.pValue).toBeCloseTo(0.025, 2);
    expect(r.verdict.kind).toBe("winner");
    expect(r.verdict.headline).toMatch(/B/);
  });

  it("doesn't call a small gap: 6/40 vs 8/40 is no difference", () => {
    const r = twoProportionTest({ leads: 40, replies: 6 }, { leads: 40, replies: 8 });
    expect(r.pValue).toBeGreaterThan(0.5);
    expect(r.verdict.kind).toBe("no_difference");
  });

  it("refuses to judge under the minimum per group, however big the gap", () => {
    const r = twoProportionTest({ leads: MIN_LEADS_PER_GROUP - 1, replies: 0 }, { leads: 40, replies: 30 });
    expect(r.verdict.kind).toBe("too_early");
  });

  it("handles zero replies on both sides without dividing by zero", () => {
    const r = twoProportionTest({ leads: 40, replies: 0 }, { leads: 40, replies: 0 });
    expect(r.pValue).toBe(1);
    expect(r.verdict.kind).toBe("no_difference");
  });
});
