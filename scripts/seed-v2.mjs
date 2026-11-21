// v2 demo data: loads the sample connections, then sends the 5 sample leads
// in clay/sample-leads-v2.csv (made-up people at real brands, example.com
// emails that can never receive mail, and signals about the made-up people
// themselves, never claims about the companies).
//   node --env-file=.env.local scripts/seed-v2.mjs [site]

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const base = process.argv[2] ?? "http://localhost:3000";
const SECRET = process.env.LEADS_API_SECRET;
if (!SECRET) {
  console.error("LEADS_API_SECRET is missing. Run with --env-file=.env.local");
  process.exit(1);
}

// 1. Connections first, so the warm paths exist when the leads arrive.
execFileSync(process.execPath, [fileURLToPath(new URL("./seed-connections.mjs", import.meta.url)), base], {
  stdio: "inherit",
  env: process.env,
});

// 2. The leads.
const [header, ...lines] = readFileSync(new URL("../clay/sample-leads-v2.csv", import.meta.url), "utf8")
  .trim()
  .split("\n")
  .map((l) => l.split(","));
const at = (n) => header.indexOf(n);
for (const r of lines) {
  const lead = {
    name: r[at("Name")],
    title: r[at("Title")],
    company: r[at("Company")],
    domain: r[at("Domain")],
    industry: r[at("Industry")],
    employee_count: r[at("Employees")],
    email: r[at("Email")],
    signal: r[at("Signal")] || undefined,
    source: "seed-v2",
  };
  const res = await fetch(`${base}/api/leads`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-secret": SECRET },
    body: JSON.stringify(lead),
  });
  const body = await res.json().catch(() => ({}));
  console.log(`${res.status} ${body.status ?? body.error ?? ""}  ${lead.name} @ ${lead.company}`);
}
console.log("\nScoring runs in the background. Open /pipeline or /queue in about 10 seconds.");
