-- Social sweep approval (AEGIS): a one-time, 36-hour go-ahead for a daily sweep that the removal ceiling stopped.
-- How zack uses it: after looking at a halted sweep, run `select public.approve_social_sweep();` in the Supabase SQL editor.
-- Run after 20261119000000_social_voting.sql, and BEFORE turning on SOCIAL_VOTING. Safe to run again.
-- Checked on local Postgres 16 by AEGIS (2026-11-19).
--
-- Shape: one row at most, holding the time the approval ends. The sweep asks for it only when its removal ceiling
-- trips (more than max(10, 20% of the replies checked) reported deleted in one run), and asking uses it up. A
-- normal run never touches it. No approval, or one past its time: the sweep removes nothing, as before.
-- There is no env var and no app route for this: an approval can only be given here, by hand.

-- 1. The approval. The check on `id` keeps the table to a single row.
create table if not exists public.social_sweep_approval (
  id boolean primary key default true check (id),
  approved_until timestamptz not null
);

-- RLS on with no policies and no table rights for any API role (server key included): only the two functions below touch it.
alter table public.social_sweep_approval enable row level security;
revoke all on public.social_sweep_approval from public, anon, authenticated, service_role;

-- 2. Giving the approval: good for the next 36 hours, so it covers the next daily run whatever time it is given.
-- Running it again just moves the end time. Returns that end time.
create or replace function public.approve_social_sweep()
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  until_at timestamptz;
begin
  insert into public.social_sweep_approval (id, approved_until)
  values (true, now() + interval '36 hours')
  on conflict (id) do update set approved_until = excluded.approved_until
  returning approved_until into until_at;
  return until_at;
end;
$$;
-- Hand-only: no API role may call it, the server key included. The SQL editor runs as the owner, so zack still can.
revoke execute on function public.approve_social_sweep() from public, anon, authenticated, service_role;

-- 3. Using the approval, in one statement so two runs can never both use the same one. The row always goes, and
-- the answer is true only when it was still in time: an approval past its time is cleared and answers false.
create or replace function public.consume_social_sweep_approval()
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  until_at timestamptz;
begin
  delete from public.social_sweep_approval returning approved_until into until_at;
  return until_at is not null and until_at > now();
end;
$$;
revoke execute on function public.consume_social_sweep_approval() from public, anon, authenticated;
grant execute on function public.consume_social_sweep_approval() to service_role;
