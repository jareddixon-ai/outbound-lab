// Sends 25 sample leads through the real pipeline, one at a time, exactly
// the way Clay will: a POST to /api/leads with the secret header.
//
// The companies are real consumer brands (public info only). Every contact
// name is made up. A few poor-fit leads are mixed in on purpose, so you can
// see Claude score them low and route them differently.
//
// Run it (with the app running in another terminal):
//   node --env-file=.env.local scripts/seed-leads.mjs
// Or against the live site:
//   node --env-file=.env.local scripts/seed-leads.mjs https://outbound-lab-plum.vercel.app

const BASE = process.argv[2] ?? "http://localhost:3000";
const SECRET = process.env.LEADS_API_SECRET;
if (!SECRET) {
  console.error("LEADS_API_SECRET is missing. Run with: node --env-file=.env.local scripts/seed-leads.mjs");
  process.exit(1);
}

const LEADS = [
  // Strong fits: consumer brands, social-facing roles
  { name: "Ana Ruiz", title: "Head of Social", company: "Glossier", domain: "glossier.com", industry: "Beauty", employee_count: 250 },
  { name: "Priya Nair", title: "Director of E-commerce", company: "Olipop", domain: "drinkolipop.com", industry: "Food & Beverage", employee_count: 300 },
  { name: "Marcus Bell", title: "VP Marketing", company: "Liquid Death", domain: "liquiddeath.com", industry: "Food & Beverage", employee_count: 250 },
  { name: "Hannah Okafor", title: "Social Media Manager", company: "Rare Beauty", domain: "rarebeauty.com", industry: "Beauty", employee_count: 200 },
  { name: "Leo Martins", title: "Head of Growth", company: "Poppi", domain: "drinkpoppi.com", industry: "Food & Beverage", employee_count: 150 },
  { name: "Grace Liu", title: "Director of Brand Marketing", company: "Summer Fridays", domain: "summerfridays.com", industry: "Beauty", employee_count: 120 },
  { name: "Daniel Ortiz", title: "CMO", company: "Graza", domain: "graza.co", industry: "Food & Beverage", employee_count: 60 },
  { name: "Chloe Bennett", title: "Head of Community", company: "Skims", domain: "skims.com", industry: "Apparel", employee_count: 900 },
  { name: "Tomás Reyes", title: "Senior Manager, Social Commerce", company: "e.l.f. Beauty", domain: "elfcosmetics.com", industry: "Beauty", employee_count: 500 },
  { name: "Nina Brooks", title: "Director of Social", company: "Fishwife", domain: "eatfishwife.com", industry: "Food & Beverage", employee_count: 40 },
  { name: "Owen Park", title: "VP E-commerce", company: "Vuori", domain: "vuoriclothing.com", industry: "Apparel", employee_count: 1500 },
  { name: "Ivy Thompson", title: "Head of Influencer & Social", company: "Touchland", domain: "touchland.com", industry: "Personal Care", employee_count: 100 },

  // Good companies, weaker roles: should land in the middle
  { name: "Ravi Shah", title: "Brand Manager", company: "Siete Foods", domain: "sietefoods.com", industry: "Food & Beverage", employee_count: 300 },
  { name: "Emma Walsh", title: "Retail Marketing Coordinator", company: "Athletic Brewing", domain: "athleticbrewing.com", industry: "Food & Beverage", employee_count: 450 },
  { name: "Kofi Mensah", title: "Product Development Manager", company: "Brightland", domain: "brightland.co", industry: "Food & Beverage", employee_count: 30 },
  { name: "Sofia Romano", title: "Founder & CEO", company: "Fly By Jing", domain: "flybyjing.com", industry: "Food & Beverage", employee_count: 35 },
  { name: "Ben Carter", title: "Marketing Manager", company: "Our Place", domain: "fromourplace.com", industry: "Home Goods", employee_count: 200 },
  { name: "Lily Zhang", title: "Customer Experience Lead", company: "Jones Road Beauty", domain: "jonesroadbeauty.com", industry: "Beauty", employee_count: 80 },

  // Poor fits: wrong role or wrong kind of company
  { name: "Mark Feldman", title: "Controller", company: "Glossier", domain: "glossier.com", industry: "Beauty", employee_count: 250 },
  { name: "Julia Novak", title: "IT Manager", company: "Olipop", domain: "drinkolipop.com", industry: "Food & Beverage", employee_count: 300 },
  { name: "Ethan Cole", title: "VP Engineering", company: "Stripe", domain: "stripe.com", industry: "Financial Software", employee_count: 8000 },
  { name: "Rachel Kim", title: "Head of Marketing", company: "Snowflake", domain: "snowflake.com", industry: "Enterprise Software", employee_count: 7000 },
  { name: "Victor Hughes", title: "Partner", company: "Example Creative Agency", domain: "example.com", industry: "Marketing Agency", employee_count: 15 },
  { name: "Maria Lopez", title: "Owner", company: "Corner Candle Co", domain: "", industry: "Home Goods", employee_count: 3 },
  { name: "Sean Murphy", title: "Procurement Manager", company: "Caterpillar", domain: "caterpillar.com", industry: "Industrial Machinery", employee_count: 110000 },
];

console.log(`Sending ${LEADS.length} sample leads to ${BASE}/api/leads\n`);
let ok = 0;
for (const lead of LEADS) {
  const res = await fetch(`${BASE}/api/leads`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-secret": SECRET },
    body: JSON.stringify({ ...lead, source: "seed" }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.log(`✗ ${lead.name} @ ${lead.company}: ${res.status} ${body.error ?? ""}`);
    continue;
  }
  ok++;
  const l = body.lead ?? {};
  const tag = body.status === "duplicate" ? "(already there)" : "";
  console.log(
    `✓ ${String(l.score ?? "--").padStart(3)}  ${l.experiment_group ?? "?"}  ${(l.owner ?? "").padEnd(13)} ${lead.name} @ ${lead.company} ${tag}`,
  );
}
console.log(`\nDone: ${ok} of ${LEADS.length} went through.`);
