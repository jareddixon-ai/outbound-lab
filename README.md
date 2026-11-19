# Outbound Lab

A small working version of an outbound engine, built with Claude Code as a demo.
It is built in three parts, all live.

| Part | What it does | Status |
| --- | --- | --- |
| A. Domain Health Checker | Grades a domain's email setup (MX, SPF, DKIM, DMARC) and lists fixes | Live at https://outbound-lab-plum.vercel.app |
| B. Lead Pipeline | Clay to this app to Supabase to Claude (score and opener) to routing to Salesforce | Live: save, score, route and create the Salesforce Lead. Clay next |
| C. Experiment Dashboard | A/B groups, reply rates, and whether the gap is big enough to trust | Live at /experiment |

## Part B: the lead pipeline

```
Clay / seed script / curl
        │  POST /api/leads   (JSON + x-api-secret header)
        ▼
app/api/leads/route.ts   check secret, check data
        │
        ▼
lib/pipeline.ts
  1. save to Supabase, put in the smaller A/B group ──► leads table
  2. lib/score.ts: Claude scores fit 0-100,        ──► events table
     writes a reason and a first line              (one row per step)
  3. lib/routing.ts: pick the AE
  4. save score, opener, owner, reasons
  5. lib/salesforce.ts: create a Salesforce Lead   ──► Salesforce
     (score, opener, A/B group, AE in custom fields)
```

| File | What it does |
| --- | --- |
| `supabase/schema.sql` | Creates the `leads` and `events` tables. Paste into Supabase's SQL Editor and run. |
| `app/api/leads/route.ts` | The front door. Refuses anything without the right secret or with bad data. |
| `lib/pipeline.ts` | Runs the steps in order and logs each one. If Claude fails, the lead is still saved and routed, marked `needs_review`. |
| `lib/icp.ts` | The ideal customer profile in plain English. Change this to change how Claude scores. |
| `lib/score.ts` | Calls the Claude API (`claude-opus-5-5`, low effort) and requires a JSON answer: `{score, reason, opener}`. |
| `lib/routing.ts` | Everyone gets an even share of leads, but only hot leads (80+) can go to the senior AE, who wins ties on them. |
| `lib/experiment.ts` | Puts each new lead in whichever A/B group is smaller, so the split stays 50/50. |
| `lib/salesforce.ts` | Logs in with OAuth client credentials (no person's password) and creates the Lead. Fills `Fit_Score__c`, `Opener__c`, `Experiment_Group__c`, `Assigned_AE__c`. A failure marks the lead `sync_failed` instead of losing it. |
| `scripts/seed-leads.mjs` | Sends 25 sample leads (real brands, made-up names) through the real pipeline. |

Design choices worth knowing:

- **Duplicates are blocked by the database**, not just the code: the same name at the same company can only exist once, so Clay re-sending a row is harmless.
- **Routing was changed after testing.** The first rule sent every 80+ lead to the senior AE. With 25 real-looking leads she got 14 and the other two got 6 each, so the rule now balances load and keeps hot leads as the only ones she can get.
- **The opener style depends on the A/B group.** Group A gets a social-trend hook, group B a peer-brand hook. Part C measures which gets more replies.
- **Claude is told never to invent facts** about a company (no made-up campaigns or numbers), because a wrong "fact" in a cold email costs more than a generic line.
- **Openers are drafts.** Nothing in this project sends email.

### Setup

1. Copy `.env.example` to `.env.local` and fill in the values (the three `SF_` values are optional; leave them empty to skip Salesforce).
2. Run `supabase/schema.sql` in Supabase's SQL Editor.
3. Start the app (`npm run dev`), then in a second terminal:

```bash
node --env-file=.env.local scripts/seed-leads.mjs
```

To send one lead by hand:

```bash
curl -X POST http://localhost:3000/api/leads \
  -H "content-type: application/json" \
  -H "x-api-secret: YOUR_SECRET" \
  -d '{"name":"Ana Ruiz","title":"Head of Social","company":"Glossier","domain":"glossier.com","industry":"Beauty","employee_count":250}'
```

## Part C: the experiment dashboard

`/experiment` shows reply rates for opener style A (social-trend hook) vs B
(peer-brand hook), a verdict, how leads are spread across AEs, and every lead
with a Replied checkbox. Nothing here sends email, so replies are marked by
hand; marking one needs the API secret.

| File | What it does |
| --- | --- |
| `supabase/002_replies.sql` | Adds `replied` and `replied_at` to `leads`. Run once in the SQL Editor. |
| `lib/stats.ts` | Two-proportion z-test, and the verdict rule: under 30 leads per group is "too early"; p < 0.05 names a winner; otherwise "no clear winner yet". |
| `app/api/experiment/route.ts` | Read-only: leads, group counts, the test result, routing per AE. |
| `app/api/experiment/reply/route.ts` | Marks a lead replied or not. Needs `x-api-secret`, and logs a `replied` event. |
| `app/experiment/page.tsx` | The dashboard page. |

## Part A: how it works

```
Browser page            Server route               Public DNS
app/page.tsx   ──────►  app/api/check/route.ts ──► 1.1.1.1 / 8.8.8.8
(input + results)       calls lib/domain-check.ts   (MX, TXT lookups)
               ◄──────  JSON report            ◄──
```

1. You type a domain on the page (`app/page.tsx`).
2. The page calls the server route `GET /api/check?domain=...` (`app/api/check/route.ts`).
3. The route cleans the input and runs four DNS lookups at once (`lib/domain-check.ts`).
4. Each lookup becomes a pass, warning, fail or "not verified" result with a one-line fix.
5. The results are scored and the page shows a grade from A to F.

### What each check looks for

| Check | Where it looks | Pass | Warning | Fail |
| --- | --- | --- | --- | --- |
| MX | MX records on the domain | At least one mail server | | None, or a "null MX" |
| SPF | TXT record starting `v=spf1` | One record ending `~all` or `-all` | `?all`, no `all`, or more than 10 lookups | Missing, more than one, or `+all` |
| DKIM | TXT at `<selector>._domainkey.<domain>` for 23 common selectors | A key was found | | Key is empty (switched off) |
| DMARC | TXT at `_dmarc.<domain>` | `p=quarantine` or `p=reject` | `p=none`, or `pct` under 100 | Missing, more than one, or no valid policy |

### Scoring

MX is worth 20 points, SPF 25, DKIM 25, DMARC 30. A pass earns full points, a
warning half, a fail zero. The score is points earned out of points possible.
90 and up is an A, 75 a B, 60 a C, 40 a D, below that an F.

### Known limits

- **DKIM can't be fully checked from outside.** Selector names are chosen by
  each email tool and DNS has no way to list them. When none of the common
  selectors has a key, the result is "not verified" and is left out of the
  score, not counted as a failure.
- **SPF lookups are counted for the top record only.** Records it includes can
  add more lookups.
- **This reads DNS only.** It can't see inbox placement, sender reputation or
  warmup, and it never sends email.

## Run it on your computer

```bash
npm run dev
```

Then open http://localhost:3000.

To test the server route by itself:

```bash
curl "http://localhost:3000/api/check?domain=nectarsocial.com"
```

## Rules for this project

- No real emails are sent. Sample contacts only.
- Public company info only.
- API keys go in `.env.local` and Vercel environment variables, never in GitHub
  (`.env*` is already in `.gitignore`).
