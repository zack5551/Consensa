-- Retention jobs and the private incident register (AEGIS, LEX's Privacy Policy §8 and breach plan). Run after
-- 20261111000300_consent_retention.sql. Safe to run again. Needs the pg_cron extension (Supabase: Database →
-- Extensions → pg_cron), which runs inside the Montreal database, so nothing leaves Canada.

create extension if not exists pg_cron;

-- 1. Consent records 3 years after the consent ended: removed every night at 04:00 UTC by the function from
--    20261111000300. Nothing else deletes them.
select cron.unschedule(jobid) from cron.job where jobname = 'consensa-purge-expired-consents';
select cron.schedule('consensa-purge-expired-consents', '0 4 * * *', $$select public.purge_expired_consents()$$);

-- 2. The privacy incident register (breach plan, Law 25 s. 3.8 and PIPEDA s. 10.3). Every incident is logged, even
--    minor ones, and each entry is kept at least 5 years. Only the secret key (staff working in the dashboard) can read or
--    write it; the anon key and signed-in users see nothing. Entries are never deleted before 5 years, and the
--    facts recorded when an incident was found can't be rewritten afterwards (corrections go in `follow_up`).
create table if not exists public.privacy_incidents (
  id bigint generated always as identity primary key,
  found_at timestamptz not null default now(),
  happened_at timestamptz,
  description text not null check (length(description) between 10 and 4000),
  cause text,
  personal_info text not null,
  people_affected integer check (people_affected >= 0),
  serious_injury_risk boolean,
  risk_reasoning text,
  notified jsonb not null default '[]'::jsonb,
  measures text,
  follow_up text,
  recorded_by text not null default coalesce(auth.jwt() ->> 'email', current_user),
  updated_at timestamptz not null default now()
);

alter table public.privacy_incidents enable row level security;
revoke all on public.privacy_incidents from anon, authenticated;

create or replace function public.privacy_incidents_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.found_at < now() - interval '5 years' then return old; end if;
    raise exception 'Incident register entries are kept at least 5 years';
  end if;
  if new.found_at <> old.found_at or new.description <> old.description or new.recorded_by <> old.recorded_by then
    raise exception 'The original record of an incident cannot be rewritten; add to follow_up instead';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists privacy_incidents_guard on public.privacy_incidents;
create trigger privacy_incidents_guard before update or delete on public.privacy_incidents
  for each row execute function public.privacy_incidents_guard();
