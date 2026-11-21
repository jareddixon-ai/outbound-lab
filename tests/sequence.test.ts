import { describe, expect, it } from "vitest";
import { SEQUENCE_PLAN, buildSequence, otherGroup } from "../lib/sequence";
import { instantlyVariables, splitName } from "../lib/instantly";

const bodies = ["one", "two", "three", "four", "five"];

describe("follow-up sequence", () => {
  it("has five steps on increasing days", () => {
    expect(SEQUENCE_PLAN).toHaveLength(5);
    const days = SEQUENCE_PLAN.map((s) => s.day);
    expect(days).toEqual([...days].sort((a, b) => a - b));
  });

  it("gives only step 1 a subject, since follow-ups reply in the thread", () => {
    const seq = buildSequence("  quick idea  ", bodies);
    expect(seq[0].subject).toBe("quick idea");
    expect(seq.slice(1).every((s) => s.subject === null)).toBe(true);
  });

  it("refuses the wrong number of emails", () => {
    expect(() => buildSequence("x", bodies.slice(0, 4))).toThrow(/Expected 5/);
  });

  it("gives step 2 the style the lead didn't get first", () => {
    expect(otherGroup("A")).toBe("B");
    expect(otherGroup("B")).toBe("A");
  });
});

describe("Instantly hand-off", () => {
  it("splits names, keeping middle names with the first name", () => {
    expect(splitName("Ana Ruiz")).toEqual({ first: "Ana", last: "Ruiz" });
    expect(splitName("Mary Kate Olsen")).toEqual({ first: "Mary Kate", last: "Olsen" });
    expect(splitName("Cher")).toEqual({ first: "Cher", last: "" });
  });

  it("sends the subject and every step as campaign variables", () => {
    const vars = instantlyVariables({
      name: "Ana Ruiz",
      email: "ana@example.com",
      title: null,
      company: "Example",
      domain: null,
      opener: null,
      experiment_group: "B",
      sequence: buildSequence("quick idea", bodies),
    });
    expect(vars).toMatchObject({ subject: "quick idea", step1: "one", step5: "five", experiment_group: "B" });
  });
});

import { duplicateMatchId } from "../lib/salesforce";

describe("Salesforce duplicates", () => {
  it("finds the existing record in a DUPLICATES_DETECTED error", () => {
    const body = [
      {
        errorCode: "DUPLICATES_DETECTED",
        message: "Use one of these records?",
        duplicateResult: { matchResults: [{ matchRecords: [{ record: { Id: "00QXX0000012345" } }] }] },
      },
    ];
    expect(duplicateMatchId(body)).toBe("00QXX0000012345");
  });

  it("returns null for any other error", () => {
    expect(duplicateMatchId([{ errorCode: "REQUIRED_FIELD_MISSING", message: "x" }])).toBeNull();
    expect(duplicateMatchId({ error: "x" })).toBeNull();
  });
});
