// The Claude step: score a lead's fit and draft a first line.
//
// This is the Claude API (Claude running inside our app, called by our code),
// not Claude Code (the assistant that wrote this file).
//
// We ask for "structured output": instead of free text, Claude must answer
// in an exact JSON shape that we define below with Zod (a library that
// describes and checks data shapes). That way our code never has to guess
// where the score is in a paragraph of text.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { ICP } from "./icp";

export type Group = "A" | "B";

export type LeadForScoring = {
  name: string;
  title: string | null;
  company: string;
  domain: string | null;
  industry: string | null;
  employee_count: number | null;
};

export type ScoreResult = {
  score: number;
  reason: string;
  opener: string;
};

// The exact shape Claude must reply in.
const ScoreSchema = z.object({
  score: z.number().describe("Fit score from 0 (no fit) to 100 (perfect fit)."),
  reason: z.string().describe("One sentence, under 30 words, explaining the score."),
  opener: z.string().describe("One sentence, under 30 words: the first line of a cold email."),
});

// The two opener styles we are A/B testing (Part C measures which one wins).
const OPENER_STYLE: Record<Group, string> = {
  A: `Social-trend hook: open with a trend in how shoppers in the company's
category discover and buy products on social media (for example, buying
straight from TikTok or Instagram).`,
  B: `Peer-brand hook: open by pointing to what other brands in the company's
category are doing on social commerce. Talk about the category in general
("other skincare brands"); never claim a named company is a customer.`,
};

const SYSTEM = `You qualify sales leads for Nectar Social and draft the first
line of a cold email. Score each lead against this ideal customer profile:

${ICP}

Scoring guide: 80-100 strong fit on both company and person. 50-79 good
company but a weaker role, or the reverse. 20-49 weak fit. 0-19 clearly not
a fit.

Rules for the opener:
- Write to the person directly, in plain, friendly words. No greeting, no
  "I hope this finds you well", no exclamation marks.
- Never invent facts about the company: no made-up campaigns, numbers,
  launches or news. Only use what is in the lead data and general knowledge
  of the category.
- Use the opener style you are given.`;

let client: Anthropic | null = null;
function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "Claude isn't configured. Add ANTHROPIC_API_KEY to .env.local (and to Vercel's environment variables).",
    );
  }
  client ??= new Anthropic();
  return client;
}

export async function scoreLead(lead: LeadForScoring, group: Group): Promise<ScoreResult> {
  const leadData = {
    name: lead.name,
    title: lead.title ?? "unknown",
    company: lead.company,
    website: lead.domain ?? "unknown",
    industry: lead.industry ?? "unknown",
    employees: lead.employee_count ?? "unknown",
  };

  const response = await anthropic().beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    // Scoring is a quick judgment call, so low effort keeps it fast and cheap.
    output_config: { effort: "low", format: betaZodOutputFormat(ScoreSchema) },
    // If Claude declines a request for safety reasons, the API retries it on
    // a fallback model automatically instead of failing.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Opener style: ${OPENER_STYLE[group]}\n\nLead:\n${JSON.stringify(leadData, null, 2)}`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Claude declined to score this lead.");
  }
  const out = response.parsed_output;
  if (!out) {
    throw new Error(`Claude's answer didn't match the expected shape (stop reason: ${response.stop_reason}).`);
  }

  return {
    // Keep the score a whole number between 0 and 100 no matter what.
    score: Math.max(0, Math.min(100, Math.round(out.score))),
    reason: out.reason.trim(),
    opener: out.opener.trim(),
  };
}
