// GET /api/sending-health: the domains and inboxes we actually send from.
//
// v1 graded whatever domain you typed. But cold email goes out through
// separate sending domains and warmed-up inboxes in Instantly, and those are
// what break. This grades every sending domain (SENDING_DOMAINS, plus the
// domain of every Instantly inbox) and shows each inbox's status and warmup
// inbox-vs-spam numbers. Public page, so inbox addresses are partly hidden.

import { connection } from "next/server";
import { checkDomain, cleanDomain } from "@/lib/domain-check";
import { inboxHealth, type InboxHealth } from "@/lib/instantly";

export const maxDuration = 60;

const mask = (email: string) => {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}${"•".repeat(Math.max(2, local.length - 1))}@${domain}`;
};

export async function GET() {
  await connection();

  let inboxes: InboxHealth[] = [];
  let instantlyError: string | null = null;
  const instantlyOn = Boolean(process.env.INSTANTLY_API_KEY);
  if (instantlyOn) {
    try {
      inboxes = await inboxHealth();
    } catch (err) {
      instantlyError = err instanceof Error ? err.message : String(err);
    }
  }

  const fromEnv = (process.env.SENDING_DOMAINS ?? "").split(",").map((d) => cleanDomain(d)).filter(Boolean) as string[];
  const fromInboxes = inboxes.map((i) => cleanDomain(i.email)).filter(Boolean) as string[];
  const domains = [...new Set([...fromEnv, ...fromInboxes])].slice(0, 20);

  const reports = await Promise.all(
    domains.map(async (d) => {
      try {
        const r = await checkDomain(d);
        return { domain: d, grade: r.grade, score: r.score, headline: r.headline, inboxes: inboxes.filter((i) => i.email.endsWith(`@${d}`)).length };
      } catch {
        return { domain: d, grade: null, score: null, headline: "The DNS lookup didn't finish.", inboxes: 0 };
      }
    }),
  );

  return Response.json({
    configured: { domains: fromEnv.length > 0, instantly: instantlyOn },
    instantlyError,
    domains: reports,
    inboxes: inboxes.map((i) => ({ ...i, email: mask(i.email) })),
    atRisk: inboxes.filter((i) => !i.healthy || (i.inboxRate !== null && i.inboxRate < 0.9)).length,
  });
}
