-- Outbound Lab v2: the whole database for a NEW Supabase project.
-- Paste this whole file into Supabase: SQL Editor > New query > Run.
-- Safe to run more than once. (v1 used schema.sql + 002_replies.sql; you
-- don't need those in the v2 project.)

-- LEADS: one row per person, with everything that happened to it.
create table if not exists leads (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  title            text,
  company          text not null,
  email            text,                                      -- v2: needed for the Instantly hand-off
  domain           text,
  industry         text,
  employee_count   integer,
  source           text not null default 'manual',

  score            integer check (score between 0 and 100),
  score_reason     text,
  opener           text,                                      -- first line of the first email
  sequence         jsonb,                                     -- v2: the 5-step follow-up sequence

  owner            text,
  routing_reason   text,

  experiment_group text check (experiment_group in ('A', 'B')),
  -- v2 adds queued and processing: the API saves first, scores after.
  status           text not null default 'queued',            -- queued, processing, routed, synced, needs_review, sync_failed
  attempts         integer not null default 0,                -- v2: how many times the background step ran
  last_attempt_at  timestamptz,
  last_error       text,

  sf_lead_id       text,
  instantly_lead_id text,                                     -- v2

  replied          boolean not null default false,
  replied_at       timestamptz,
  reply_step       integer,                                   -- v2: which sequence step got the reply
  positive_reply   boolean not null default false,            -- v2: Instantly marked it interested or booked

  created_at       timestamptz not null default now()
);

create unique index if not exists leads_person_company_unique
  on leads (lower(name), lower(company));
create index if not exists leads_status_idx on leads (status, last_attempt_at);
create index if not exists leads_email_idx on leads (lower(email));

-- EVENTS: the step-by-step log for every lead.
create table if not exists events (
  id          bigint generated always as identity primary key,
  lead_id     uuid not null references leads (id) on delete cascade,
  type        text not null,
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists events_lead_id_idx on events (lead_id, created_at);

alter table leads  enable row level security;
alter table events enable row level security;

-- v2: ATOMIC A/B ASSIGNMENT.
-- v1 counted the groups in one query and inserted in another, so two leads
-- arriving at once could both see "A is smaller". Here the count and the
-- insert happen inside one transaction, behind a lock that only one caller
-- can hold at a time. Same rule as lib/experiment.ts: smaller group wins,
-- coin flip on a tie.
create or replace function insert_lead(p jsonb) returns leads
language plpgsql as $$
declare
  a int;
  b int;
  g text;
  r leads;
begin
  perform pg_advisory_xact_lock(hashtext('outbound_lab_groups'));
  select count(*) filter (where experiment_group = 'A'),
         count(*) filter (where experiment_group = 'B')
    into a, b
    from leads;
  g := case when a < b then 'A' when b < a then 'B' when random() < 0.5 then 'A' else 'B' end;

  insert into leads (name, company, title, email, domain, industry, employee_count, source, experiment_group, status)
  values (p->>'name', p->>'company', p->>'title', p->>'email', p->>'domain', p->>'industry',
          (p->>'employee_count')::int, coalesce(p->>'source', 'manual'), g, 'queued')
  returning * into r;
  return r;
end $$;

-- v2: ATOMIC ROUTING.
-- The app decides WHO is eligible (lib/routing.ts: hot leads can go to any
-- AE, the rest only to non-senior AEs). This function picks the eligible AE
-- with the fewest leads, ties going to list order, and saves it, all under
-- one lock. Returns the owner and the counts it saw, for the reason text.
create or replace function route_lead(p_lead uuid, p_eligible text[]) returns jsonb
language plpgsql as $$
declare
  v_owner  text;
  v_counts jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('outbound_lab_routing'));

  with load as (
    select e.name, e.ord, coalesce(x.c, 0) as c
      from unnest(p_eligible) with ordinality as e(name, ord)
      left join (select owner, count(*) as c from leads where owner is not null group by owner) x
        on x.owner = e.name
  )
  select (select name from load order by c asc, ord asc limit 1),
         (select jsonb_object_agg(name, c) from load)
    into v_owner, v_counts;

  update leads set owner = v_owner where id = p_lead;
  return jsonb_build_object('owner', v_owner, 'counts', v_counts);
end $$;

-- Only the server (service role) may call these. Without this, Postgres
-- lets anyone with the public key call a function.
revoke execute on function insert_lead(jsonb) from public, anon, authenticated;
revoke execute on function route_lead(uuid, text[]) from public, anon, authenticated;
grant execute on function insert_lead(jsonb) to service_role;
grant execute on function route_lead(uuid, text[]) to service_role;
