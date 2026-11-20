// POST /api/leads: the front door for new leads.
//
// v2: this route only checks and saves the lead, then answers right away
// with 202 ("accepted, still working"). Scoring, routing, Salesforce and
// Instantly run after the response is sent, using next/server's after().
// So Clay waits well under a second per row instead of about five.
//
// The secret header matters because this address is on the public internet.

import { after } from "next/server";
import { secretMatches } from "@/lib/auth";
import { LeadInput, intakeLead, processLead } from "@/lib/pipeline";

// after() runs inside this route's time budget, so give the Claude step room.
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!process.env.LEADS_API_SECRET) {
    return Response.json(
      { error: "LEADS_API_SECRET isn't set on the server, so all requests are refused." },
      { status: 500 },
    );
  }
  if (!secretMatches(request.headers.get("x-api-secret"))) {
    return Response.json({ error: "Missing or wrong x-api-secret header." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "The body must be JSON." }, { status: 400 });
  }

  const parsed = LeadInput.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "The lead is missing something or has a wrong value.",
        problems: parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`),
      },
      { status: 400 },
    );
  }

  try {
    const result = await intakeLead(parsed.data);
    if (result.status === "queued") {
      const id = result.lead.id as string;
      after(async () => {
        try {
          await processLead(id);
        } catch (err) {
          // The worker (/api/worker) will pick it up again.
          console.error("Background step failed", id, err instanceof Error ? err.message : err);
        }
      });
    }
    return Response.json(result, { status: result.status === "queued" ? 202 : 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Lead intake failed", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
