-- Rules the database enforces on calls, whatever the app does (ca-central-1). Run after
-- 20261111000100_crowd.sql. Safe to run again.
--
-- 1. A call can't be saved or changed once its question has closed. The close time lives in
--    question_windows, which only the app's server writes (secret key). A question with no window takes no calls.
-- 2. A person can change the same call at most once every 2 seconds (a write rate limit at the source).

create table if not exists public.question_windows (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  closes_at timestamptz not null
);

alter table public.question_windows enable row level security;
-- No policies: only the secret key (which bypasses row-level security) reads or writes it.
revoke all on public.question_windows from anon, authenticated;

create or replace function public.enforce_call_rules()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  closes timestamptz;
begin
  select w.closes_at into closes from public.question_windows w where w.slug = new.slug;
  if closes is null or now() >= closes then
    raise exception 'question closed' using errcode = 'P0001', hint = 'closed';
  end if;
  if tg_op = 'UPDATE' and old.updated_at > now() - interval '2 seconds' then
    raise exception 'too many changes' using errcode = 'P0001', hint = 'rate';
  end if;
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists calls_enforce_rules on public.calls;
create trigger calls_enforce_rules
  before insert or update on public.calls
  for each row execute function public.enforce_call_rules();
