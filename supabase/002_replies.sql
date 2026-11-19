-- Part C: track which leads replied, so we can compare reply rates for
-- opener style A vs B. Run this once in Supabase: SQL Editor > New query.
-- Safe to run twice ("if not exists").

alter table leads add column if not exists replied boolean not null default false;
alter table leads add column if not exists replied_at timestamptz;
