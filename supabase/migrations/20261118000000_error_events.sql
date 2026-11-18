-- The in-house error log (AEGIS, LEX). Run after 20261111000400_retention_and_incidents.sql. Safe to run again.
--
-- Errors stay in the Montréal database instead of going to an outside error service. Each row says where it broke
-- and what broke, never who: no IP, email, cookies, headers, query strings or form values (the app scrubs before
-- it writes). Only the server can read or write it. Rows are deleted after 90 days (Privacy Policy §8).

create table if not exists public.error_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  source text not null check (source in ('server', 'browser')),
  route text not null check (char_length(route) <= 200),
  name text not null check (char_length(name) <= 100),
  message text not null check (char_length(message) <= 500),
  digest text check (digest ~ '^[A-Za-z0-9_-]{1,64}$'),
  stack text check (char_length(stack) <= 4000)
);
create index if not exists error_events_at on public.error_events (at);

alter table public.error_events enable row level security;
revoke all on public.error_events from anon, authenticated;

-- Deleted after 90 days, every night at 04:15 UTC, inside the database (pg_cron), so nothing leaves Canada.
select cron.unschedule(jobid) from cron.job where jobname = 'consensa-purge-error-events';
select cron.schedule('consensa-purge-error-events', '15 4 * * *', $$delete from public.error_events where at < now() - interval '90 days'$$);
