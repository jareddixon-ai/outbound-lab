# Outbound Lab

A small working version of an outbound engine, built with Claude Code as a demo.
It is being built in three parts. Part A is done.

| Part | What it does | Status |
| --- | --- | --- |
| A. Domain Health Checker | Grades a domain's email setup (MX, SPF, DKIM, DMARC) and lists fixes | Built, runs locally, not deployed yet |
| B. Lead Pipeline | Clay to this app to Supabase to Claude (score and opener) to routing to Salesforce | Not started |
| C. Experiment Dashboard | A/B groups, reply rates, and whether the gap is big enough to trust | Not started |

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
