-- Outbound Lab database tables.
-- Paste this whole file into Supabase: SQL Editor > New query > Run.
-- It is safe to run more than once.

-- LEADS: one row per person. This is the source of truth for every lead,
-- what Claude thought of it, who owns it, and which experiment it's in.
create table if not exists leads (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  title            text,
  company          text not null,
  domain           text,
  industry         text,
  employee_count   integer,
  source           text not null default 'manual',   -- where it came from: clay, seed, manual

  score            integer check (score between 0 and 100),  -- Claude's fit score
  score_reason     text,                                      -- Claude's one-sentence why
  opener           text,                                      -- Claude's draft first line (never sent)

  owner            text,                                      -- the AE it was routed to
  routing_reason   text,                                      -- plain-English why

  experiment_group text check (experiment_group in ('A', 'B')),
  status           text not null default 'new',               -- new, scored, routed, synced, needs_review
  sf_lead_id       text,                                      -- Salesforce Lead ID, filled in later

  created_at       timestamptz not null default now()
);

-- The same person at the same company is one lead, even if Clay sends it twice.
create unique index if not exists leads_person_company_unique
  on leads (lower(name), lower(company));

-- EVENTS: a log of everything that happened to a lead, in order.
-- This is how you can always answer "why did this lead end up there?"
create table if not exists events (
  id          bigint generated always as identity primary key,
  lead_id     uuid not null references leads (id) on delete cascade,
  type        text not null,          -- received, scored, score_failed, routed, synced
  detail      jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists events_lead_id_idx on events (lead_id, created_at);

-- Row Level Security on, with no policies: the public internet can't read or
-- write these tables at all. Only our server, using the secret key, can.
alter table leads  enable row level security;
alter table events enable row level security;
