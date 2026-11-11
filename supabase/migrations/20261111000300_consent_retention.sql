-- Consent records: how long they are kept (LEX). Run after 20261111000200_call_rules.sql. Safe to run again.
--
-- A consent "ends" when it is withdrawn or when the account is deleted. The row is then kept for 3 years as proof
-- of what was agreed (CASL, Law 25), and only after that can it be removed, by purge_expired_consents(). Nothing
-- else can delete a consent row.

-- Deleting an account ends its open consents. The rows stay; only withdrawn_at is set.
create or replace function public.end_consents_on_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.email is not null then
    update public.consent_log set withdrawn_at = now()
    where email_hash = public.email_hash(old.email) and withdrawn_at is null;
  end if;
  return old;
end;
$$;
drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted after delete on auth.users for each row execute function public.end_consents_on_delete();

-- Append-only, except that a row whose consent ended more than 3 years ago may be removed.
create or replace function public.consent_log_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.withdrawn_at is not null and old.withdrawn_at < now() - interval '3 years' then return old; end if;
    raise exception 'The consent log is append-only until 3 years after a consent ends';
  end if;
  if new.email_hash <> old.email_hash or new.kind <> old.kind or new.version <> old.version or new.given_at <> old.given_at
     or old.withdrawn_at is not null then
    raise exception 'Only withdrawing a consent can change a consent row';
  end if;
  return new;
end;
$$;

-- Removes consent rows whose consent ended more than 3 years ago. Server only (secret key); run it on a schedule.
create or replace function public.purge_expired_consents() returns bigint
language sql security definer set search_path = '' as $$
  with gone as (
    delete from public.consent_log where withdrawn_at is not null and withdrawn_at < now() - interval '3 years' returning 1
  )
  select count(*)::bigint from gone;
$$;
revoke execute on function public.purge_expired_consents() from public, anon, authenticated;
grant execute on function public.purge_expired_consents() to service_role;
