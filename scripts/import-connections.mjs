// Loads one person's connections for warm intros.
//
// LinkedIn: Settings > Data privacy > Get a copy of your data > Connections.
// The download has Connections.csv. Then run:
//   node --env-file=.env.local scripts/import-connections.mjs "Maya Chen" ~/Downloads/Connections.csv [site]
//
// Only first name, last name, company and position are sent. Email
// addresses and profile URLs in the file are ignored. Everyone starts at
// strength 1 ("connected"); raise the people you really know with the
// optional "Strength" column (0-3) or by re-importing them.
//
// For customers or past champions, add a 4th argument: customer | past_champion

import { readFileSync } from "node:fs";

const [owner, file, base = "http://localhost:3000", kind = "rep"] = process.argv.slice(2);
if (!owner || !file) {
  console.error('Usage: node --env-file=.env.local scripts/import-connections.mjs "Owner Name" Connections.csv [site] [kind]');
  process.exit(1);
}
const SECRET = process.env.LEADS_API_SECRET;
if (!SECRET) {
  console.error("LEADS_API_SECRET is missing. Run with --env-file=.env.local");
  process.exit(1);
}

// A small CSV reader that handles quoted fields with commas.
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim()));
}

const rows = parseCsv(readFileSync(file, "utf8"));
// LinkedIn puts a few "Notes" lines above the real header.
const headerAt = rows.findIndex((r) => r.map((c) => c.trim().toLowerCase()).includes("company"));
if (headerAt < 0) {
  console.error("Couldn't find a header row with a Company column.");
  process.exit(1);
}
const header = rows[headerAt].map((c) => c.trim().toLowerCase());
const col = (name) => header.indexOf(name);
const [fi, li, ci, pi, si] = [col("first name"), col("last name"), col("company"), col("position"), col("strength")];

const connections = rows
  .slice(headerAt + 1)
  .map((r) => ({
    person_name: `${r[fi] ?? ""} ${r[li] ?? ""}`.trim(),
    company: (r[ci] ?? "").trim(),
    title: (r[pi] ?? "").trim() || undefined,
    strength: si >= 0 && r[si]?.trim() ? Number(r[si]) : 1,
  }))
  .filter((c) => c.person_name && c.company);

console.log(`Sending ${connections.length} connections for ${owner} (${kind}) to ${base}/api/connections`);
const res = await fetch(`${base}/api/connections`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-api-secret": SECRET },
  body: JSON.stringify({ owner, kind, connections }),
});
console.log(res.status, await res.text());
