// POST /api/leads: the front door for new leads.
//
// Clay (or the seed script, or curl) sends one lead as JSON. We check the
// secret header, check the data, then run the pipeline: save, score with
// Claude, route to an AE.
//
// The secret header matters because this address is on the public internet.
// Without it, anyone who found the URL could fill the database with junk
// and run up the Claude bill.

import { secretMatches } from "@/lib/auth";
import { LeadInput, processLead } from "@/lib/pipeline";

// Give the Claude step room to finish on Vercel.
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
    const result = await processLead(parsed.data);
    return Response.json(result, { status: result.status === "created" ? 201 : 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Lead pipeline failed", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
