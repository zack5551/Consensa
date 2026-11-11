-- Accounts and calls (ca-central-1).
--
-- Run once in the Supabase dashboard: SQL Editor → New query → paste this file → Run. Safe to run again.
--
-- Security model (AEGIS + LEX):
-- - Row-level security is on for every table. A signed-in person can read their own profile and their own calls,
--   and nothing else. Nobody can read another person's calls, ever, with any key the browser holds.
-- - Calls are written only by the app's server, with the secret key, after it checks the session and that the
--   question is still open. The browser has no insert or update rights on `calls`, so the close time can't be dodged.
-- - A profile can only be created at signup, by the trigger below, and only when the person confirmed they are 18+
--   and accepted the terms. We keep a yes and a timestamp, never a birth date (LEX §6).
-- - Consents are four separate timestamps. Null means "not given". Analytics, data licensing and marketing start null.
-- - Deleting the auth user (the "Delete my account" button, Law 25) removes their profile and calls by cascade.
--   That is the person's own request; nothing else in the app deletes rows.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  locale text not null default 'en' check (locale in ('en', 'fr')),
  region text check (region in ('BC', 'AB', 'PR', 'ON', 'QC', 'AT')),
  topics text[] not null default '{}' check (cardinality(topics) <= 12),
  adult_confirmed_at timestamptz not null,
  terms_accepted_at timestamptz not null,
  data_licensing_at timestamptz,
  analytics_at timestamptz,
  marketing_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calls (
  user_id uuid not null references auth.users (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  probability smallint not null check (probability between 1 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, slug)
);
create index if not exists calls_slug on public.calls (slug);

alter table public.profiles enable row level security;
alter table public.calls enable row level security;

-- Read your own rows only. No insert, update or delete policies: writes go through the server.
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "calls: read own" on public.calls;
create policy "calls: read own" on public.calls for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.profiles from anon;
revoke all on public.calls from anon;
revoke insert, update, delete on public.profiles from authenticated;
revoke insert, update, delete on public.calls from authenticated;

-- Signup: the onboarding form sends its answers as user metadata. No 18+ yes or no terms → no account.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  r text := m ->> 'region';
begin
  if coalesce((m ->> 'adult')::boolean, false) is not true or coalesce((m ->> 'terms')::boolean, false) is not true then
    raise exception 'Consensa accounts need the 18+ check and the terms' using errcode = 'check_violation';
  end if;
  insert into public.profiles (id, locale, region, topics, adult_confirmed_at, terms_accepted_at, data_licensing_at, analytics_at, marketing_at)
  values (
    new.id,
    case when m ->> 'locale' = 'fr' then 'fr' else 'en' end,
    case when r in ('BC', 'AB', 'PR', 'ON', 'QC', 'AT') then r else null end,
    coalesce(array(select jsonb_array_elements_text(coalesce(m -> 'topics', '[]'::jsonb)) limit 12), '{}'),
    now(),
    now(),
    case when coalesce((m ->> 'dataLicensing')::boolean, false) then now() end,
    case when coalesce((m ->> 'analytics')::boolean, false) then now() end,
    case when coalesce((m ->> 'marketing')::boolean, false) then now() end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
