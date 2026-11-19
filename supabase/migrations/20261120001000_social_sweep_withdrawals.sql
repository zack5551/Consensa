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
-- How zack restores a wrongly withdrawn (or held) reply, in the Supabase SQL editor:
--   select platform, reply_id, slug, withdrawn_at, held_at from public.social_votes
--    where withdrawn_at is not null or held_at is not null order by coalesce(withdrawn_at, held_at) desc;
--   select public.restore_social_reply('x', '1990000000000000007', 'zack');
-- The third value is the name of the person doing it. It is required (LEX) and kept in the restore log.
-- It answers 'counted' (the call is back), 'website_wins' or 'older_reply' (the reply is live again, and a website
-- call or a newer reply still sets the call), 'live' (nothing to do), 'expired', 'after_close' or 'unknown'.
-- While the question is open: a held reply at any time, a withdrawn one for 7 days after the withdrawal.
-- After the question has closed (LEX): still possible, by hand only, for a reply that was written BEFORE the close.
-- A withdrawn reply keeps its 7 days from the withdrawal; a held one has 7 days from the close. The call that comes
-- back is a call made in time: it carries the reply's own time, and if the question is already resolved it is
-- scored like any other call. A reply written at or after the close answers 'after_close' and nothing changes.
-- Every restore, whatever it answers, is written to public.social_reply_restore_log (section 4).
-- Both logs are kept for 12 months, then purged by the sweep's run (section 8). When a person deletes their
-- account, the reply id and the person's id are blanked in their restore-log rows at once; the rest of the row stays.
--
-- How zack approves a halted sweep, with his name and the reason (both required, LEX):
--   select public.approve_social_sweep('zack', 'Checked 20 of the replies on X by hand: all really deleted.');
--
-- To read the logs:     select * from public.social_sweep_approval_log order by id;
--                       select * from public.social_reply_restore_log order by id;
-- To see an open halt:  select * from public.social_sweep_halt;

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

-- 4. Putting a reply back (LEX). By hand it is restore_social_reply(), zack's, in the SQL editor (see the top of this
-- file). The sweep has a narrower way, release_social_reply(): a HELD reply the platform reports as still up, on an
-- open question only. Both go through one internal function, and every time it runs it adds a row to the restore log.

-- 4a. The restore log: append-only but for two narrow cases (the guard is in section 8). When, which database role,
-- the name the person gave ('system' for the sweep), by hand or by the sweep, which reply, what the function
-- answered, and whether the question had closed by then.
-- reply_id is personal information (LEX). user_id is here only so that the row can be found when that person deletes
-- their account: both are then set to null (section 8). user_id is empty when no such reply was found.
create table if not exists public.social_reply_restore_log (
  id bigint generated always as identity primary key,
  restored_at timestamptz not null default now(),
  restored_by text not null,
  restored_name text not null,
  origin text not null check (origin in ('hand', 'sweep')),
  platform text not null,
  reply_id text,
  user_id uuid,
  result text not null,
  after_close boolean not null
);
alter table public.social_reply_restore_log enable row level security;
revoke all on public.social_reply_restore_log from public, anon, authenticated, service_role;
create index if not exists social_reply_restore_log_user on public.social_reply_restore_log (user_id) where user_id is not null;

-- 4b. The one way a call may be written after its question has closed. The calls trigger (enforce_call_rules, from
-- 20261111000200_call_rules.sql) refuses every such write. A restore of a reply written before the close has to get
-- one write through, and nothing else may.
--
-- It is NOT a session setting. Any role that can run SQL can set_config() a custom setting, so a setting can be
-- forged. It is a row in this table, and holding a pass means having been able to write here: RLS is on with no
-- policy, and no API role has any right on the table, the server key included. Only the internal restore function
-- below (which runs as the owner and which no API role may call) writes a pass. A pass names one person, one
-- question, the exact probability and source, and the transaction that wrote it; the same function deletes it
-- before that transaction ends. So a pass is never committed, no other transaction can ever see one, and it lets
-- through exactly the one row the restore writes.
create table if not exists public.call_restore_pass (
  user_id uuid not null,
  slug text not null,
  probability smallint not null,
  source text not null,
  made_at timestamptz not null,       -- when the reply was written: the restored call carries this time
  txid xid8 not null default pg_current_xact_id(),
  primary key (user_id, slug)
);
alter table public.call_restore_pass enable row level security;
revoke all on public.call_restore_pass from public, anon, authenticated, service_role;

-- The calls trigger, replaced. Its two rules are unchanged (no write once the question has closed; one change per
-- call every 2 seconds). The only addition is the first block: after the close, a write that matches a pass of this
-- same transaction, for a call made before the close, goes through and carries the time the call was made.
create or replace function public.enforce_call_rules()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  closes timestamptz;
  made timestamptz;
begin
  select w.closes_at into closes from public.question_windows w where w.slug = new.slug;
  if closes is not null and now() >= closes then
    select p.made_at into made from public.call_restore_pass p
    where p.user_id = new.user_id and p.slug = new.slug
      and p.probability = new.probability and p.source = new.source
      and p.txid = pg_current_xact_id() and p.made_at < closes;
    if found then
      new.updated_at := made;
      if tg_op = 'INSERT' then
        new.created_at := made;
      end if;
      return new;
    end if;
  end if;
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

-- 4c. The internal function. p_origin is 'hand' (restore_social_reply) or 'sweep' (release_social_reply); p_name is
-- the name the person gave, or 'system' for the sweep.
-- A held reply, or one withdrawn in the last 7 days, becomes live again and the person's call is re-derived: it
-- counts again unless a website call or a newer live reply sets the call.
-- After the close: by hand only, only for a reply written before the close, and for a held reply only in the 7 days
-- after the close. Held replies are never put back automatically at the close.
-- Internal: no API role may call it.
create or replace function public.put_back_social_reply(p_platform text, p_reply_id text, p_origin text, p_name text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  back public.social_votes%rowtype;
  latest public.social_votes%rowtype;
  closes timestamptz;
  closed boolean := false;
  call_source text;
  result text;
begin
  <<work>>
  begin
    select * into back from public.social_votes v where v.platform = p_platform and v.reply_id = p_reply_id for update;
    if not found then result := 'unknown'; exit work; end if;
    if back.withdrawn_at is null and back.held_at is null then result := 'live'; exit work; end if;
    if back.withdrawn_at <= now() - interval '7 days' then result := 'expired'; exit work; end if;
    select w.closes_at into closes from public.question_windows w where w.slug = back.slug;
    closed := closes is null or now() >= closes;
    if closed then
      -- The sweep never reaches past the close, and a question with no window takes no calls at all.
      if closes is null or p_origin <> 'hand' then result := 'closed'; exit work; end if;
      if back.replied_at >= closes then result := 'after_close'; exit work; end if;
      if back.held_at is not null and closes <= now() - interval '7 days' then result := 'expired'; exit work; end if;
    end if;

    update public.social_votes v set withdrawn_at = null, held_at = null where v.platform = p_platform and v.reply_id = p_reply_id;

    select c.source into call_source from public.calls c where c.user_id = back.user_id and c.slug = back.slug;
    if call_source = 'web' then result := 'website_wins'; exit work; end if;
    select * into latest from public.social_votes v
    where v.user_id = back.user_id and v.slug = back.slug and v.withdrawn_at is null and v.held_at is null
    order by v.replied_at desc, v.seen_at desc limit 1;
    if latest.platform is distinct from back.platform or latest.reply_id is distinct from back.reply_id then
      result := 'older_reply'; exit work;
    end if;

    if closed then
      insert into public.call_restore_pass (user_id, slug, probability, source, made_at)
      values (back.user_id, back.slug, back.probability, back.platform, back.replied_at);
    end if;
    insert into public.calls (user_id, slug, probability, source)
    values (back.user_id, back.slug, back.probability, back.platform)
    on conflict (user_id, slug) do update set probability = excluded.probability, source = excluded.source
    where public.calls.source <> 'web';
    delete from public.call_restore_pass p where p.user_id = back.user_id and p.slug = back.slug;
    result := 'counted';
  end;

  insert into public.social_reply_restore_log (restored_by, restored_name, origin, platform, reply_id, user_id, result, after_close)
  values (session_user, p_name, p_origin, p_platform, p_reply_id, back.user_id, result, closed);
  return result;
end;
$$;
revoke execute on function public.put_back_social_reply(text, text, text, text) from public, anon, authenticated, service_role;

-- By hand, with the name of the person doing it (required, 80 characters at most; a blank name is refused and nothing
-- is restored). Hand-only: no API role may call it, the server key included.
-- The version without a name goes, so a restore can't be done without saying who. With the old approval function
-- (section 7) it is one of the only two drops in this file.
drop function if exists public.restore_social_reply(text, text);
create or replace function public.restore_social_reply(p_platform text, p_reply_id text, p_name text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  who text := btrim(coalesce(p_name, ''));
begin
  if who = '' then
    raise exception 'restore_social_reply needs a name' using errcode = '22023';
  end if;
  if length(who) > 80 then
    raise exception 'name too long (80)' using errcode = '22023';
  end if;
  return public.put_back_social_reply(p_platform, p_reply_id, 'hand', who);
end;
$$;
revoke execute on function public.restore_social_reply(text, text, text) from public, anon, authenticated, service_role;

-- The sweep's own, narrower way back: a HELD reply the platform now reports as still up counts again. It can never
-- touch a withdrawn reply, and it can never write a call after the close: both take a person.
create or replace function public.release_social_reply(p_platform text, p_reply_id text)
returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.social_votes v
                 where v.platform = p_platform and v.reply_id = p_reply_id and v.held_at is not null) then
    return 'unknown';
  end if;
  return public.put_back_social_reply(p_platform, p_reply_id, 'sweep', 'system');
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

-- 7. The approval log (LEX): append-only, kept 12 months (the guard is in section 8). One row per event, each carrying the approval it belongs to:
--   'given'    approve_social_sweep() was run. approved_name and approved_reason are what the person typed;
--              approved_by is the database role of that session.
--   'used'     a run over the ceiling asked for it. used_at is when; in_time says whether it still counted.
--   'removed'  that run finished. removed is how many replies it took out. used_at ties it to its 'used' row.
-- A 'used' row with in_time true and no 'removed' row after it means the run stopped before it could report.
alter table public.social_sweep_approval add column if not exists approved_at timestamptz;
alter table public.social_sweep_approval add column if not exists approved_by text;
alter table public.social_sweep_approval add column if not exists approved_name text;
alter table public.social_sweep_approval add column if not exists approved_reason text;

create table if not exists public.social_sweep_approval_log (
  id bigint generated always as identity primary key,
  logged_at timestamptz not null default now(),
  event text not null check (event in ('given', 'used', 'removed')),
  approved_at timestamptz not null,
  approved_by text not null,
  approved_name text not null,
  approved_reason text not null,
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

-- Giving the approval, as before (36 hours, hand-only), now with a required name and a required reason (LEX), and
-- recording when and by which database role. A missing or blank name or reason is refused and nothing is approved.
-- session_user is the role that opened the session; inside a privileged function current_user is only the owner.
-- The version without arguments (20261120000000_social_sweep_approval.sql) goes, so an approval can't be given
-- without saying who and why.
drop function if exists public.approve_social_sweep();
create or replace function public.approve_social_sweep(p_name text, p_reason text)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  who text := btrim(coalesce(p_name, ''));
  why text := btrim(coalesce(p_reason, ''));
  until_at timestamptz;
begin
  if who = '' or why = '' then
    raise exception 'approve_social_sweep needs a name and a reason' using errcode = '22023';
  end if;
  if length(who) > 80 or length(why) > 500 then
    raise exception 'name (80) or reason (500) too long' using errcode = '22023';
  end if;
  insert into public.social_sweep_approval (id, approved_until, approved_at, approved_by, approved_name, approved_reason)
  values (true, now() + interval '36 hours', now(), session_user, who, why)
  on conflict (id) do update
    set approved_until = excluded.approved_until, approved_at = excluded.approved_at, approved_by = excluded.approved_by,
        approved_name = excluded.approved_name, approved_reason = excluded.approved_reason
  returning approved_until into until_at;
  insert into public.social_sweep_approval_log (event, approved_at, approved_by, approved_name, approved_reason, approved_until)
  values ('given', now(), session_user, who, why, until_at);
  return until_at;
end;
$$;
revoke execute on function public.approve_social_sweep(text, text) from public, anon, authenticated, service_role;

-- Using the approval, as before (single-use; true only when still in time), now logging the use. An approval given
-- before this migration has no approved_at, name or reason: the time is worked out from its end, the rest is 'unknown'.
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
  insert into public.social_sweep_approval_log (event, approved_at, approved_by, approved_name, approved_reason, approved_until, used_at, in_time)
  values ('used', coalesce(used.approved_at, used.approved_until - interval '36 hours'), coalesce(used.approved_by, 'unknown'),
          coalesce(used.approved_name, 'unknown'), coalesce(used.approved_reason, 'unknown'), used.approved_until, now(), ok);
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
  insert into public.social_sweep_approval_log (event, approved_at, approved_by, approved_name, approved_reason, approved_until, used_at, removed)
  values ('removed', last_use.approved_at, last_use.approved_by, last_use.approved_name, last_use.approved_reason,
          last_use.approved_until, last_use.used_at, p_removed);
  return true;
exception when unique_violation then
  return false;
end;
$$;
revoke execute on function public.record_social_sweep_removals(integer) from public, anon, authenticated;
grant execute on function public.record_social_sweep_removals(integer) to service_role;

-- 8. The two logs' guards, their 12 months, and what happens when an account is deleted (LEX).
--
-- Both logs are append-only. A row is never changed or removed, by anyone, the functions in this file included,
-- with exactly two exceptions:
--   (i)  a row older than 12 months may be deleted (either log);
--   (ii) in the restore log, reply_id and user_id may go from a value to null (or stay null), and nothing else in
--        that row may change. Each column is compared by name with IS NOT DISTINCT FROM (AEGIS): no row
--        comparison, because a null inside a row comparison answers null, not false.
-- Everything else is refused: any other UPDATE, any DELETE of a younger row, and every TRUNCATE.
-- No API role can use the exceptions: anon, authenticated and service_role have no right at all on either table
-- (revoke all, in sections 4 and 7), so their UPDATE or DELETE is refused before a trigger ever runs. The guards are
-- not privileged functions and give nobody a right they don't have. The only ways in for the server key are
-- purge_social_audit_logs() below, which deletes by age and takes no argument, and the account-deletion trigger,
-- which nulls the two columns for the account being deleted and takes none either.

-- TRUNCATE on either log: always refused.
create or replace function public.social_log_append_only()
returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

create or replace function public.social_sweep_approval_log_guard()
returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and old.logged_at < now() - interval '12 months' then
    return old;
  end if;
  raise exception 'social_sweep_approval_log is append-only until a row is 12 months old';
end;
$$;

create or replace function public.social_reply_restore_log_guard()
returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.restored_at < now() - interval '12 months' then
      return old;
    end if;
    raise exception 'social_reply_restore_log is append-only until a row is 12 months old';
  end if;
  -- UPDATE: only forgetting whose reply it was. Each of the two personal columns ends up null (from a value, or
  -- still null), and every other column is the same as before, compared one by one.
  if new.reply_id is null and new.user_id is null
     and new.id is not distinct from old.id
     and new.restored_at is not distinct from old.restored_at
     and new.restored_by is not distinct from old.restored_by
     and new.restored_name is not distinct from old.restored_name
     and new.origin is not distinct from old.origin
     and new.platform is not distinct from old.platform
     and new.result is not distinct from old.result
     and new.after_close is not distinct from old.after_close then
    return new;
  end if;
  raise exception 'social_reply_restore_log is append-only: only reply_id and user_id may be set to null';
end;
$$;

drop trigger if exists social_sweep_approval_log_append_only on public.social_sweep_approval_log;
create trigger social_sweep_approval_log_append_only before update or delete on public.social_sweep_approval_log
  for each row execute function public.social_sweep_approval_log_guard();
drop trigger if exists social_sweep_approval_log_no_truncate on public.social_sweep_approval_log;
create trigger social_sweep_approval_log_no_truncate before truncate on public.social_sweep_approval_log
  for each statement execute function public.social_log_append_only();
drop trigger if exists social_reply_restore_log_append_only on public.social_reply_restore_log;
create trigger social_reply_restore_log_append_only before update or delete on public.social_reply_restore_log
  for each row execute function public.social_reply_restore_log_guard();
drop trigger if exists social_reply_restore_log_no_truncate on public.social_reply_restore_log;
create trigger social_reply_restore_log_no_truncate before truncate on public.social_reply_restore_log
  for each statement execute function public.social_log_append_only();

-- Account deletion. The app deletes the auth.users row (DELETE /api/account), and the person's profile, calls, links
-- and ledger rows go with it by cascade. The restore log has no foreign key, on purpose: its rows must stay. So, in
-- the same way as on_auth_user_deleted ends the consents (20261111000300_consent_retention.sql), a trigger on
-- auth.users blanks what is personal in that person's restore-log rows: the reply id and their own id. It runs in
-- the deleting transaction, so the account can't go while the ids stay, and it can't fail on a person with no rows.
-- Platform, times, result, after_close and who acted are kept.
create or replace function public.forget_social_restores_on_delete()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.social_reply_restore_log l set reply_id = null, user_id = null where l.user_id = old.id;
  return old;
end;
$$;
drop trigger if exists on_auth_user_deleted_forget_social_restores on auth.users;
create trigger on_auth_user_deleted_forget_social_restores after delete on auth.users
  for each row execute function public.forget_social_restores_on_delete();

-- The 12 months. Called by each sweep run, next to purge_withdrawn_social_replies(). Returns how many rows went.
create or replace function public.purge_social_audit_logs()
returns integer
language sql security definer set search_path = '' as $$
  with approvals as (
    delete from public.social_sweep_approval_log l where l.logged_at < now() - interval '12 months' returning 1
  ),
  restores as (
    delete from public.social_reply_restore_log l where l.restored_at < now() - interval '12 months' returning 1
  )
  select ((select count(*) from approvals) + (select count(*) from restores))::integer
$$;
revoke execute on function public.purge_social_audit_logs() from public, anon, authenticated;
grant execute on function public.purge_social_audit_logs() to service_role;
