import { describe, expect, it } from "vitest";
import { scoreBand, segmentTable, sizeBand, titleLevel } from "../lib/segments";

describe("segments", () => {
  it("reads seniority from titles", () => {
    expect(titleLevel("Founder & CEO")).toBe("Exec / founder");
    expect(titleLevel("VP of Growth")).toBe("VP");
    expect(titleLevel("Head of Influencer & Social")).toBe("Head / director");
    expect(titleLevel("IT Director")).toBe("Head / director");
    expect(titleLevel("Senior Manager, Social Commerce")).toBe("Manager / lead");
    expect(titleLevel("Retail Marketing Coordinator")).toBe("Individual contributor");
    expect(titleLevel(null)).toBe("Unknown");
  });

  it("bands company size and fit score", () => {
    expect(sizeBand(12)).toBe("1–49");
    expect(sizeBand(250)).toBe("250–999");
    expect(sizeBand(null)).toBe("Unknown");
    expect(scoreBand(80)).toBe("80–100");
    expect(scoreBand(3)).toBe("0–19");
    expect(scoreBand(null)).toBe("Unscored");
  });

  it("counts replies per segment and group, biggest segment first", () => {
    const rows = segmentTable(
      [
        { experiment_group: "A", replied: true, positive_reply: true, t: "x" },
        { experiment_group: "B", replied: false, t: "x" },
        { experiment_group: "B", replied: true, t: "x" },
        { experiment_group: "A", replied: false, t: "y" },
      ],
      (l) => l.t,
    );
    expect(rows.map((r) => r.segment)).toEqual(["x", "y"]);
    expect(rows[0]).toMatchObject({ leads: 3, replies: 2, positive: 1, A: { leads: 1, replies: 1 }, B: { leads: 2, replies: 1 } });
  });
});
