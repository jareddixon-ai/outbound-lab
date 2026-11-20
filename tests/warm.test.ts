import { describe, expect, it } from "vitest";
import { bestWarmPath, pairSdr, priority, warmOwner, type Connection } from "../lib/warm";

const c = (owner: string, person_name: string, company: string, strength: number, kind: Connection["kind"] = "rep"): Connection => ({
  owner,
  kind,
  person_name,
  company,
  title: null,
  strength,
});
const lead = { name: "Priya Natarajan", company: "Kosas" };

describe("warm paths", () => {
  it("finds nothing when nobody knows anyone at the company", () => {
    expect(bestWarmPath(lead, [c("Maya Chen", "Someone", "Glossier", 3)])).toBeNull();
  });

  it("prefers knowing the lead over knowing a colleague, even a closer colleague", () => {
    const path = bestWarmPath(lead, [c("Sam Rivera", "Tess Alvarez", "Kosas", 3), c("Maya Chen", "priya natarajan", "KOSAS", 2)]);
    expect(path).toMatchObject({ kind: "knows_lead", owner: "Maya Chen" });
  });

  it("picks the strongest relationship among colleagues", () => {
    const path = bestWarmPath(lead, [c("Sam Rivera", "A Person", "Kosas", 1), c("Jordan Patel", "B Person", "Kosas", 3)]);
    expect(path).toMatchObject({ kind: "knows_colleague", owner: "Jordan Patel", strength: 3 });
  });

  it("ignores strength-0 rows and labels customers as an intro path", () => {
    expect(bestWarmPath(lead, [c("Maya Chen", "Priya Natarajan", "Kosas", 0)])).toBeNull();
    expect(bestWarmPath(lead, [c("Glossier", "Priya Natarajan", "Kosas", 2, "customer")])?.kind).toBe("customer_intro");
  });

  it("only overrides routing for a team AE with at least a real relationship", () => {
    expect(warmOwner({ kind: "knows_lead", owner: "Maya Chen", via: "x", strength: 2 })).toBe("Maya Chen");
    expect(warmOwner({ kind: "knows_lead", owner: "Maya Chen", via: "x", strength: 1 })).toBeNull();
    expect(warmOwner({ kind: "customer_intro", owner: "Glossier", via: "x", strength: 3 })).toBeNull();
    expect(warmOwner({ kind: "knows_lead", owner: "Not On Team", via: "x", strength: 3 })).toBeNull();
  });

  it("pairs an SDR only on a 90+ lead with a warm path", () => {
    const path = { kind: "knows_lead" as const, owner: "Maya Chen", via: "x", strength: 3 };
    expect(pairSdr(92, path)).not.toBeNull();
    expect(pairSdr(89, path)).toBeNull();
    expect(pairSdr(95, null)).toBeNull();
  });
});

describe("priority", () => {
  it("is the score when there's no signal or warm path", () => {
    expect(priority(70, null, null)).toBe(70);
    expect(priority(null, null, null)).toBe(0);
  });

  it("puts a well-known 75 ahead of a cold 90", () => {
    const warm = priority(75, null, { kind: "knows_lead", owner: "Maya Chen", via: "x", strength: 3 });
    expect(warm).toBeGreaterThan(priority(90, null, null));
  });

  it("adds a bump for a signal, but not for a blank one", () => {
    expect(priority(60, "Started this role 6 weeks ago", null)).toBe(70);
    expect(priority(60, "   ", null)).toBe(60);
  });
});
