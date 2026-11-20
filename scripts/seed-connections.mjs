// Loads clay/sample-connections.csv (made-up relationships for the demo)
// so the warm-intro paths show up when the sample leads come in.
//   node --env-file=.env.local scripts/seed-connections.mjs [site]

import { readFileSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3000";
const SECRET = process.env.LEADS_API_SECRET;
if (!SECRET) {
  console.error("LEADS_API_SECRET is missing. Run with --env-file=.env.local");
  process.exit(1);
}

const [header, ...lines] = readFileSync(new URL("../clay/sample-connections.csv", import.meta.url), "utf8")
  .trim()
  .split("\n")
  .map((l) => l.split(","));
const at = (name) => header.indexOf(name);

const groups = new Map();
for (const r of lines) {
  const key = `${r[at("Owner")]}|${r[at("Kind")]}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push({
    person_name: `${r[at("First Name")]} ${r[at("Last Name")]}`,
    company: r[at("Company")],
    title: r[at("Position")],
    strength: Number(r[at("Strength")]),
  });
}

for (const [key, connections] of groups) {
  const [owner, kind] = key.split("|");
  const res = await fetch(`${base}/api/connections`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-secret": SECRET },
    body: JSON.stringify({ owner, kind, connections }),
  });
  console.log(`${owner} (${kind}): ${res.status} ${await res.text()}`);
}
