-- Sign-ups never confirmed by email are deleted after 7 days (AEGIS, LEX's Privacy Policy §8). Run after
-- 20261111000400_retention_and_incidents.sql (pg_cron must be on). Safe to run again.
--
-- Sign-up creates the account on our server before the email link is clicked, so an address someone typed for another
-- person, or a bot that passed the bot check, leaves an account that never proved the address is theirs. After 7 days the
-- account, its profile and its calls (cascade) are removed, together with the consent rows recorded when it was created.
-- Those consents were never valid (the address was never confirmed) and we never relied on them, so the 3-year record
-- does not apply to them (LEX, 2026-11-18). Consent rows from an earlier, confirmed account with the same address are
-- older than this account and are never touched.

-- The consent log stays append-only, with two exceptions: rows whose consent ended more than 3 years ago, and rows
-- removed by purge_unconfirmed_signups() below (it sets a flag for its own transaction only).
create or replace function public.consent_log_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.withdrawn_at is not null and old.withdrawn_at < now() - interval '3 years' then return old; end if;
    if current_setting('consensa.unconfirmed_purge', true) = 'on' then return old; end if;
    raise exception 'The consent log is append-only until 3 years after a consent ends';
  end if;
  if new.email_hash <> old.email_hash or new.kind <> old.kind or new.version <> old.version or new.given_at <> old.given_at
     or old.withdrawn_at is not null then
    raise exception 'Only withdrawing a consent can change a consent row';
  end if;
  return new;
end;
$$;

-- Deletes accounts that never confirmed their email and never signed in, 7 days after they were created. Server only.
create or replace function public.purge_unconfirmed_signups() returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  removed bigint;
begin
  perform set_config('consensa.unconfirmed_purge', 'on', true);

  with unconfirmed as (
    select u.id, u.created_at, public.email_hash(u.email) as email_hash
    from auth.users u
    where u.email is not null
      and u.email_confirmed_at is null
      and u.last_sign_in_at is null
      and u.created_at < now() - interval '7 days'
  ),
  -- Only the consents recorded when this account was created (same transaction as the account, so never earlier).
  consents as (
    delete from public.consent_log c
    using unconfirmed s
    where c.email_hash = s.email_hash and c.given_at >= s.created_at - interval '5 minutes'
    returning 1
  )
  delete from auth.users u using unconfirmed s where u.id = s.id;
  get diagnostics removed = row_count;

  perform set_config('consensa.unconfirmed_purge', 'off', true);
  return removed;
end;
$$;
revoke execute on function public.purge_unconfirmed_signups() from public, anon, authenticated;
grant execute on function public.purge_unconfirmed_signups() to service_role;

-- Every night at 04:30 UTC, inside the Montréal database.
select cron.unschedule(jobid) from cron.job where jobname = 'consensa-purge-unconfirmed-signups';
select cron.schedule('consensa-purge-unconfirmed-signups', '30 4 * * *', $$select public.purge_unconfirmed_signups()$$);
