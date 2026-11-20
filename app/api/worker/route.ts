// GET /api/worker: retries leads the background step didn't finish.
//
// Picks up to 10 leads that are queued, failed scoring (needs_review),
// failed Salesforce (sync_failed) or got stuck, and runs processLead() on
// each. Each lead gets 3 attempts, then waits for a person.
//
// Vercel Cron calls this on the schedule in vercel.json, with
// "Authorization: Bearer <CRON_SECRET>". You can also run it by hand:
//   curl -H "x-api-secret: $LEADS_API_SECRET" https://<your-site>/api/worker

import { connection } from "next/server";
import { workerAllowed } from "@/lib/auth";
import { leadsNeedingWork, processLead } from "@/lib/pipeline";

export const maxDuration = 300;

export async function GET(request: Request) {
  await connection();
  if (!workerAllowed(request.headers)) {
    return Response.json({ error: "Not allowed." }, { status: 401 });
  }

  const ids = await leadsNeedingWork(10);
  const results: { id: string; status: string }[] = [];
  // One at a time: keeps Claude and Salesforce calls well under rate limits.
  for (const id of ids) {
    try {
      const lead = await processLead(id);
      results.push({ id, status: lead?.status ?? "skipped" });
    } catch (err) {
      results.push({ id, status: `error: ${err instanceof Error ? err.message : String(err)}` });
    }
  }
  return Response.json({ checked: ids.length, results });
}
