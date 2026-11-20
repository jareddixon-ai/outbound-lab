import { describe, expect, it } from "vitest";
import { pickGroup } from "../lib/experiment";

describe("A/B group assignment", () => {
  it("fills the smaller group", () => {
    expect(pickGroup({ A: 3, B: 5 })).toBe("A");
    expect(pickGroup({ A: 9, B: 2 })).toBe("B");
  });

  it("uses the coin only on a tie", () => {
    expect(pickGroup({ A: 4, B: 4 }, 0.1)).toBe("A");
    expect(pickGroup({ A: 4, B: 4 }, 0.9)).toBe("B");
  });

  it("keeps the split within one lead after many assignments", () => {
    const counts = { A: 0, B: 0 };
    for (let i = 0; i < 101; i++) counts[pickGroup(counts)] += 1;
    expect(Math.abs(counts.A - counts.B)).toBeLessThanOrEqual(1);
  });
});
