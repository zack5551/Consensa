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
-- - Each consent is its own row in `consent_log` with the wording version and a timestamp (terms, data
--   licensing, analytics, marketing). No row means "not given". The log is append-only and keyed by a SHA-256
--   hash of the email, with no other personal information and no link to the account, so it survives account
--   deletion as CASL proof (kept 3 years after the consent ends, privacy policy §8). Withdrawing sets
--   `withdrawn_at`; rows are never deleted by the app.
-- - Deleting the auth user (the "Delete my account" button, Law 25) removes their profile and calls by cascade.
--   That is the person's own request; nothing else in the app deletes rows. The consent log stays, as above.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  locale text not null default 'en' check (locale in ('en', 'fr')),
  region text check (region in ('BC', 'AB', 'PR', 'ON', 'QC', 'AT')),
  topics text[] not null default '{}' check (cardinality(topics) <= 12),
  adult_confirmed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per consent given, with the wording version shown at the time. No account link, no email: a hash only.
create table if not exists public.consent_log (
  id bigint generated always as identity primary key,
  email_hash text not null check (email_hash ~ '^[0-9a-f]{64}$'),
  kind text not null check (kind in ('terms', 'dataLicensing', 'analytics', 'marketing')),
  version text not null check (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  given_at timestamptz not null default now(),
  withdrawn_at timestamptz
);
create index if not exists consent_log_email_hash on public.consent_log (email_hash, kind);

create or replace function public.consent_log_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'The consent log is append-only'; end if;
  if new.email_hash <> old.email_hash or new.kind <> old.kind or new.version <> old.version or new.given_at <> old.given_at
     or old.withdrawn_at is not null then
    raise exception 'Only withdrawing a consent can change a consent row';
  end if;
  return new;
end;
$$;
drop trigger if exists consent_log_append_only on public.consent_log;
create trigger consent_log_append_only before update or delete on public.consent_log for each row execute function public.consent_log_append_only();

create or replace function public.email_hash(email text) returns text
language sql immutable set search_path = '' as $$ select encode(extensions.digest(lower(trim(email)), 'sha256'), 'hex') $$;

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
alter table public.consent_log enable row level security;

-- Read your own rows only. No insert, update or delete policies: writes go through the server.
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "calls: read own" on public.calls;
create policy "calls: read own" on public.calls for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "consent_log: read own" on public.consent_log;
create policy "consent_log: read own" on public.consent_log for select to authenticated
  using (email_hash = public.email_hash((select auth.jwt()) ->> 'email'));

revoke all on public.profiles from anon;
revoke all on public.calls from anon;
revoke all on public.consent_log from anon;
revoke insert, update, delete on public.consent_log from authenticated;
revoke insert, update, delete on public.profiles from authenticated;
revoke insert, update, delete on public.calls from authenticated;

-- Signup: the onboarding form sends its answers as user metadata. No 18+ yes or no terms → no account.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  r text := m ->> 'region';
  v text := coalesce(nullif(m ->> 'consentVersion', ''), '2026-11-11');
begin
  if v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then v := '2026-11-11'; end if;
  if coalesce((m ->> 'adult')::boolean, false) is not true or coalesce((m ->> 'terms')::boolean, false) is not true then
    raise exception 'Consensa accounts need the 18+ check and the terms' using errcode = 'check_violation';
  end if;
  insert into public.profiles (id, locale, region, topics, adult_confirmed_at)
  values (
    new.id,
    case when m ->> 'locale' = 'fr' then 'fr' else 'en' end,
    case when r in ('BC', 'AB', 'PR', 'ON', 'QC', 'AT') then r else null end,
    coalesce(array(select jsonb_array_elements_text(coalesce(m -> 'topics', '[]'::jsonb)) limit 12), '{}'),
    now()
  );
  insert into public.consent_log (email_hash, kind, version) values (public.email_hash(new.email), 'terms', v);
  if coalesce((m ->> 'dataLicensing')::boolean, false) then insert into public.consent_log (email_hash, kind, version) values (public.email_hash(new.email), 'dataLicensing', v); end if;
  if coalesce((m ->> 'analytics')::boolean, false) then insert into public.consent_log (email_hash, kind, version) values (public.email_hash(new.email), 'analytics', v); end if;
  if coalesce((m ->> 'marketing')::boolean, false) then insert into public.consent_log (email_hash, kind, version) values (public.email_hash(new.email), 'marketing', v); end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
