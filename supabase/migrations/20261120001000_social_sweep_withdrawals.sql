-- Social sweep withdrawals (LEX's three conditions before SOCIAL_VOTING may be turned on; ca-central-1).
-- Run after 20261120000000_social_sweep_approval.sql, and BEFORE turning on SOCIAL_VOTING. Safe to run again.
-- Not run on any Postgres yet.
--
-- What changes:
--   1. A halt no longer leaves deleted replies counting. The replies a halted run found gone are HELD: hidden from
--      "Canada says" at once, not removed. The first halt's time is kept, so the app can raise the alarm again when a
--      halt is still open 72 hours later.
--   2. Every use of the hand-given approval is logged: when it was given and by which database role, when it was
--      used, and how many replies that run took out.
--   3. The sweep no longer deletes a reply it finds gone. It marks it withdrawn. A withdrawn reply stops counting at
--      once, can be put back by hand for 7 days, and is deleted for real by the first sweep run after those 7 days.
--
-- One mechanism, two markers on public.social_votes (never both on one row):
--   held_at       set by a HALTED run. Hidden while a person decides. The sweep keeps checking it: the next run that
--                 goes ahead withdraws it if the platform still reports it gone, and counts it again if the platform
--                 reports it back.
--   withdrawn_at  set by a run that went ahead (under the ceiling, or approved). Not checked again. Purged after 7 days.
-- A reply is LIVE when both are empty. "Canada says" is built from public.calls, and a person's call is always the
-- latest LIVE reply (or their website call, which wins). Every function below that touches a marker re-derives the
-- call in the same transaction, so a held or withdrawn reply never counts, in any total built from calls.
--
-- How zack restores a wrongly withdrawn (or held) reply, within 7 days, in the Supabase SQL editor:
--   select platform, reply_id, slug, withdrawn_at, held_at from public.social_votes
--    where withdrawn_at is not null or held_at is not null order by coalesce(withdrawn_at, held_at) desc;
--   select public.restore_social_reply('x', '1990000000000000007');
-- It answers 'counted' (the call is back), 'website_wins' or 'older_reply' (the reply is live again, and a website
-- call or a newer reply still sets the call), 'live' (nothing to do), 'closed' (the question has closed: nothing
-- changes), 'expired' (withdrawn more than 7 days ago) or 'unknown'.
-- To read the approval log:  select * from public.social_sweep_approval_log order by id;
-- To see an open halt:       select * from public.social_sweep_halt;

-- 1. The two markers.
alter table public.social_votes add column if not exists withdrawn_at timestamptz;
alter table public.social_votes add column if not exists held_at timestamptz;
alter table public.social_votes drop constraint if exists social_votes_one_marker;
alter table public.social_votes add constraint social_votes_one_marker check (withdrawn_at is null or held_at is null);
create index if not exists social_votes_withdrawn on public.social_votes (withdrawn_at) where withdrawn_at is not null;
create index if not exists social_votes_held on public.social_votes (post_id) where held_at is not null;

-- 2. Counting a reply: the same function as in 20261119000000_social_voting.sql, with one change. "Latest reply wins"
-- now looks at LIVE replies only, so a held or withdrawn reply can't stand in the way of one that is still up.
create or replace function public.count_social_reply(
  p_platform text, p_reply_id text, p_post_id text, p_platform_user_id text,
  p_slug text, p_probability smallint, p_replied_at timestamptz
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid;
  closes timestamptz;
  existing_source text;
begin
  -- Linked, not paused, and the Cansensa account is confirmed.
  select l.user_id into uid
  from public.social_links l join auth.users u on u.id = l.user_id
  where l.platform = p_platform and l.platform_user_id = p_platform_user_id
    and not l.paused and u.email_confirmed_at is not null;
  if uid is null then return 'unlinked'; end if;

  -- Same close time as the website. A reply written after the close never counts, even if read later.
  select w.closes_at into closes from public.question_windows w where w.slug = p_slug;
  if closes is null or p_replied_at >= closes or now() >= closes then return 'closed'; end if;
  -- A reply can't predate the link.
  if p_replied_at < (select l.linked_at from public.social_links l where l.platform = p_platform and l.user_id = uid) then
    return 'before_link';
  end if;

  -- A reply already in the ledger stays as it is, whatever its marker: a held or withdrawn one is not counted again here.
  insert into public.social_votes (platform, reply_id, post_id, user_id, slug, probability, replied_at)
  values (p_platform, p_reply_id, p_post_id, uid, p_slug, p_probability, p_replied_at)
  on conflict (platform, reply_id) do nothing;
  if not found then return 'duplicate'; end if;

  select c.source into existing_source from public.calls c where c.user_id = uid and c.slug = p_slug;
  if existing_source = 'web' then return 'website_wins'; end if;

  -- Latest reply wins among LIVE social replies.
  if exists (select 1 from public.social_votes v
             where v.user_id = uid and v.slug = p_slug and v.replied_at > p_replied_at
               and v.withdrawn_at is null and v.held_at is null) then
    return 'older_reply';
  end if;

  insert into public.calls (user_id, slug, probability, source)
  values (uid, p_slug, p_probability, p_platform)
  on conflict (user_id, slug) do update set probability = excluded.probability, source = excluded.source
  where public.calls.source <> 'web';
  return 'counted';
end;
$$;
revoke execute on function public.count_social_reply(text, text, text, text, text, smallint, timestamptz) from public, anon, authenticated;
grant execute on function public.count_social_reply(text, text, text, text, text, smallint, timestamptz) to service_role;

-- 3. Taking a reply out of the count, without deleting it. p_hold = true holds it (a halted run); false withdraws it.
-- The call follows in the same transaction, as before: a website call stands; otherwise the call goes back to the
-- person's latest LIVE reply, or is removed when there is none. Only while the question is open.
-- Returns 'unknown' (no such reply, or already withdrawn), 'closed', 'held' (already held, nothing changed),
-- 'removed' (marked; the call didn't depend on it), 'restored' (the call went back to an earlier reply) or 'call_removed'.
-- Internal: no API role may call it. The two functions after it are the way in.
create or replace function public.mark_social_reply_gone(p_platform text, p_reply_id text, p_hold boolean)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  gone public.social_votes%rowtype;
  latest public.social_votes%rowtype;
  closes timestamptz;
  call_source text;
begin
  select * into gone from public.social_votes v where v.platform = p_platform and v.reply_id = p_reply_id for update;
  if not found or gone.withdrawn_at is not null then return 'unknown'; end if;
  if p_hold and gone.held_at is not null then return 'held'; end if;
  select w.closes_at into closes from public.question_windows w where w.slug = gone.slug;
  if closes is null or now() >= closes then return 'closed'; end if;

  select c.source into call_source from public.calls c where c.user_id = gone.user_id and c.slug = gone.slug;
  -- The reply that sets the call today. A reply that was already held is not live, so it is never this one.
  select * into latest from public.social_votes v
  where v.user_id = gone.user_id and v.slug = gone.slug and v.withdrawn_at is null and v.held_at is null
  order by v.replied_at desc, v.seen_at desc limit 1;

  if p_hold then
    update public.social_votes v set held_at = now() where v.platform = p_platform and v.reply_id = p_reply_id;
  else
    update public.social_votes v set withdrawn_at = now(), held_at = null where v.platform = p_platform and v.reply_id = p_reply_id;
  end if;

  -- A website call, a newer reply, or an earlier hold already settled the call: nothing else changes.
  if call_source is null or call_source = 'web'
     or latest.platform is distinct from gone.platform or latest.reply_id is distinct from gone.reply_id then
    return 'removed';
  end if;

  select * into latest from public.social_votes v
  where v.user_id = gone.user_id and v.slug = gone.slug and v.withdrawn_at is null and v.held_at is null
  order by v.replied_at desc, v.seen_at desc limit 1;
  if found then
    update public.calls c set probability = latest.probability, source = latest.platform
    where c.user_id = gone.user_id and c.slug = gone.slug and c.source <> 'web';
    return 'restored';
  end if;
  delete from public.calls c where c.user_id = gone.user_id and c.slug = gone.slug and c.source <> 'web';
  return 'call_removed';
end;
$$;
revoke execute on function public.mark_social_reply_gone(text, text, boolean) from public, anon, authenticated, service_role;

-- The old name stays, and no longer deletes: a reply the platform reports gone is withdrawn.
create or replace function public.remove_social_reply(p_platform text, p_reply_id text)
returns text
language sql security definer set search_path = '' as $$
  select public.mark_social_reply_gone(p_platform, p_reply_id, false)
$$;
revoke execute on function public.remove_social_reply(text, text) from public, anon, authenticated;
grant execute on function public.remove_social_reply(text, text) to service_role;

-- A halted run holds what it found gone.
create or replace function public.hold_social_reply(p_platform text, p_reply_id text)
returns text
language sql security definer set search_path = '' as $$
  select public.mark_social_reply_gone(p_platform, p_reply_id, true)
$$;
revoke execute on function public.hold_social_reply(text, text) from public, anon, authenticated;
grant execute on function public.hold_social_reply(text, text) to service_role;

-- 4. Putting a reply back (zack, by hand; see the top of this file). A held reply, or one withdrawn in the last 7 days,
-- becomes live again and the person's call is re-derived: it counts again unless a website call or a newer live reply
-- sets the call. Only while the question is open, the same rule as every other change to a call.
-- Hand-only: no API role may call it, the server key included.
create or replace function public.restore_social_reply(p_platform text, p_reply_id text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  back public.social_votes%rowtype;
  latest public.social_votes%rowtype;
  closes timestamptz;
  call_source text;
begin
  select * into back from public.social_votes v where v.platform = p_platform and v.reply_id = p_reply_id for update;
  if not found then return 'unknown'; end if;
  if back.withdrawn_at is null and back.held_at is null then return 'live'; end if;
  if back.withdrawn_at <= now() - interval '7 days' then return 'expired'; end if;
  select w.closes_at into closes from public.question_windows w where w.slug = back.slug;
  if closes is null or now() >= closes then return 'closed'; end if;

  update public.social_votes v set withdrawn_at = null, held_at = null where v.platform = p_platform and v.reply_id = p_reply_id;

  select c.source into call_source from public.calls c where c.user_id = back.user_id and c.slug = back.slug;
  if call_source = 'web' then return 'website_wins'; end if;
  select * into latest from public.social_votes v
  where v.user_id = back.user_id and v.slug = back.slug and v.withdrawn_at is null and v.held_at is null
  order by v.replied_at desc, v.seen_at desc limit 1;
  if latest.platform is distinct from back.platform or latest.reply_id is distinct from back.reply_id then
    return 'older_reply';
  end if;

  insert into public.calls (user_id, slug, probability, source)
  values (back.user_id, back.slug, back.probability, back.platform)
  on conflict (user_id, slug) do update set probability = excluded.probability, source = excluded.source
  where public.calls.source <> 'web';
  return 'counted';
end;
$$;
revoke execute on function public.restore_social_reply(text, text) from public, anon, authenticated, service_role;

-- The sweep's own, narrower way back: a HELD reply the platform now reports as still up counts again. It can never
-- touch a withdrawn reply; that takes a person.
create or replace function public.release_social_reply(p_platform text, p_reply_id text)
returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.social_votes v
                 where v.platform = p_platform and v.reply_id = p_reply_id and v.held_at is not null) then
    return 'unknown';
  end if;
  return public.restore_social_reply(p_platform, p_reply_id);
end;
$$;
revoke execute on function public.release_social_reply(text, text) from public, anon, authenticated;
grant execute on function public.release_social_reply(text, text) to service_role;

-- 5. The real deletion, 7 days after a withdrawal, on the database's own clock. Called by each sweep run. Only the
-- ledger row goes; the call was settled when the reply was withdrawn. Returns how many rows went.
create or replace function public.purge_withdrawn_social_replies()
returns integer
language sql security definer set search_path = '' as $$
  with purged as (
    delete from public.social_votes v where v.withdrawn_at < now() - interval '7 days' returning 1
  )
  select count(*)::integer from purged
$$;
revoke execute on function public.purge_withdrawn_social_replies() from public, anon, authenticated;
grant execute on function public.purge_withdrawn_social_replies() to service_role;

-- 6. The open halt: one row at most, holding when the first halted run happened. It stays until a run leaves no
-- held reply on an open question, so "still open after 72 hours" is measured from the first halt, not the latest.
create table if not exists public.social_sweep_halt (
  id boolean primary key default true check (id),
  first_halted_at timestamptz not null default now()
);
alter table public.social_sweep_halt enable row level security;
revoke all on public.social_sweep_halt from public, anon, authenticated, service_role;

-- A halted run says so. Returns when the open halt first happened (now, when this is the first).
create or replace function public.note_social_sweep_halt()
returns timestamptz
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.social_sweep_halt (id) values (true) on conflict (id) do nothing;
  return (select h.first_halted_at from public.social_sweep_halt h where h.id);
end;
$$;
revoke execute on function public.note_social_sweep_halt() from public, anon, authenticated;
grant execute on function public.note_social_sweep_halt() to service_role;

-- A run that was not halted asks whether the halt is over. While any reply on an open question is still held, it
-- is not: the answer is when it first happened. Otherwise the halt row goes and the answer is null.
create or replace function public.settle_social_sweep_halt()
returns timestamptz
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.social_votes v join public.question_windows w on w.slug = v.slug
             where v.held_at is not null and w.closes_at > now()) then
    insert into public.social_sweep_halt (id) values (true) on conflict (id) do nothing;
    return (select h.first_halted_at from public.social_sweep_halt h where h.id);
  end if;
  delete from public.social_sweep_halt h where h.id;
  return null;
end;
$$;
revoke execute on function public.settle_social_sweep_halt() from public, anon, authenticated;
grant execute on function public.settle_social_sweep_halt() to service_role;

-- 7. The approval log (LEX): append-only. One row per event, each carrying the approval it belongs to:
--   'given'    approve_social_sweep() was run. approved_by is the database role of that session.
--   'used'     a run over the ceiling asked for it. used_at is when; in_time says whether it still counted.
--   'removed'  that run finished. removed is how many replies it took out. used_at ties it to its 'used' row.
-- A 'used' row with in_time true and no 'removed' row after it means the run stopped before it could report.
alter table public.social_sweep_approval add column if not exists approved_at timestamptz;
alter table public.social_sweep_approval add column if not exists approved_by text;

create table if not exists public.social_sweep_approval_log (
  id bigint generated always as identity primary key,
  logged_at timestamptz not null default now(),
  event text not null check (event in ('given', 'used', 'removed')),
  approved_at timestamptz not null,
  approved_by text not null,
  approved_until timestamptz not null,
  used_at timestamptz,
  in_time boolean,
  removed integer check (removed is null or removed >= 0),
  check ((event = 'given') = (used_at is null)),
  check ((event = 'used') = (in_time is not null)),
  check ((event = 'removed') = (removed is not null))
);
-- One 'removed' row per use, whatever happens.
create unique index if not exists social_sweep_approval_log_one_count
  on public.social_sweep_approval_log (used_at) where event = 'removed';

-- RLS on with no policies and no table rights for any API role (server key included): only the functions below write it.
alter table public.social_sweep_approval_log enable row level security;
revoke all on public.social_sweep_approval_log from public, anon, authenticated, service_role;

-- Rows are never changed or removed, by anyone, the functions below included.
create or replace function public.social_sweep_approval_log_append_only()
returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'The social sweep approval log is append-only';
end;
$$;
drop trigger if exists social_sweep_approval_log_append_only on public.social_sweep_approval_log;
create trigger social_sweep_approval_log_append_only before update or delete on public.social_sweep_approval_log
  for each row execute function public.social_sweep_approval_log_append_only();
drop trigger if exists social_sweep_approval_log_no_truncate on public.social_sweep_approval_log;
create trigger social_sweep_approval_log_no_truncate before truncate on public.social_sweep_approval_log
  for each statement execute function public.social_sweep_approval_log_append_only();

-- Giving the approval, as before (36 hours, hand-only), now recording when and by which database role.
-- session_user is the role that opened the session; inside a privileged function current_user is only the owner.
create or replace function public.approve_social_sweep()
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  until_at timestamptz;
begin
  insert into public.social_sweep_approval (id, approved_until, approved_at, approved_by)
  values (true, now() + interval '36 hours', now(), session_user)
  on conflict (id) do update
    set approved_until = excluded.approved_until, approved_at = excluded.approved_at, approved_by = excluded.approved_by
  returning approved_until into until_at;
  insert into public.social_sweep_approval_log (event, approved_at, approved_by, approved_until)
  values ('given', now(), session_user, until_at);
  return until_at;
end;
$$;
revoke execute on function public.approve_social_sweep() from public, anon, authenticated, service_role;

-- Using the approval, as before (single-use; true only when still in time), now logging the use. An approval given
-- before this migration has no approved_at: it is worked out from its end time.
create or replace function public.consume_social_sweep_approval()
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  used public.social_sweep_approval%rowtype;
  ok boolean;
begin
  delete from public.social_sweep_approval a where a.id returning * into used;
  if not found then return false; end if;
  ok := used.approved_until > now();
  insert into public.social_sweep_approval_log (event, approved_at, approved_by, approved_until, used_at, in_time)
  values ('used', coalesce(used.approved_at, used.approved_until - interval '36 hours'), coalesce(used.approved_by, 'unknown'),
          used.approved_until, now(), ok);
  return ok;
end;
$$;
revoke execute on function public.consume_social_sweep_approval() from public, anon, authenticated;
grant execute on function public.consume_social_sweep_approval() to service_role;

-- The approved run reports how many replies it took out, once its removals are done (the number isn't known sooner).
-- It is written against the latest use, only when that use was in time, and only once. Returns true when written.
create or replace function public.record_social_sweep_removals(p_removed integer)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  last_use public.social_sweep_approval_log%rowtype;
begin
  if p_removed is null or p_removed < 0 then return false; end if;
  select * into last_use from public.social_sweep_approval_log l where l.event = 'used' order by l.id desc limit 1;
  if not found or not last_use.in_time then return false; end if;
  insert into public.social_sweep_approval_log (event, approved_at, approved_by, approved_until, used_at, removed)
  values ('removed', last_use.approved_at, last_use.approved_by, last_use.approved_until, last_use.used_at, p_removed);
  return true;
exception when unique_violation then
  return false;
end;
$$;
revoke execute on function public.record_social_sweep_removals(integer) from public, anon, authenticated;
grant execute on function public.record_social_sweep_removals(integer) to service_role;
