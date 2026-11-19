-- Social voting (sprint 11): replies from linked social accounts count as calls (ca-central-1).
-- Run after 20261118001000_purge_unconfirmed_signups.sql (pg_cron must be on). Safe to run again.
-- Run it BEFORE turning on SOCIAL_VOTING: with the flag on, the web call upsert writes calls.source.
-- Tested on a local Postgres 16 only (all migrations in order, twice). Never run against the real project yet.
--
-- Sections 0 to 9 are AEGIS's draft (/security/social-voting-rls-draft.sql), unchanged but for one thing: its single
-- "revoke all on a, b, c from public, anon" is split into one statement per table, because
-- tests/unit/migrations-guard.test.ts needs to see each table closed to the public key by name.
-- Sections 10 to 13 are additions the build needed (AEGIS notes 5, 6 and 7, and the relink cooldown): link and
-- unlink in one transaction, removing a deleted reply, the reader's place per post, and the spend counter.
--
-- Shape: `calls` stays the one truth (one person, one call per question). `social_votes` is only the ingest ledger
-- that makes the reader idempotent and lets a deleted reply take its call back out. No tokens, no reply text and no
-- usernames anywhere, except a handle the person chose to show.

-- 0. Where a call came from, so "a website call wins over a reply" is enforced by the database, not just the app.
alter table public.calls add column if not exists source text not null default 'web'
  check (source in ('web', 'x', 'threads', 'instagram', 'facebook'));

-- 1. Linked social accounts. One social account ↔ one person, one link per platform per person.
create table if not exists public.social_links (
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('x', 'threads', 'instagram', 'facebook')),
  platform_user_id text not null check (platform_user_id ~ '^[0-9]{1,30}$'),   -- numeric ids only, never a handle
  handle text check (handle is null or handle ~ '^[A-Za-z0-9_.]{1,30}$'),
  show_handle boolean not null default false,
  linked_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  paused boolean not null default false,          -- set by the monthly re-check (failed Canada/VPN/age or account gone)
  primary key (user_id, platform),
  unique (platform, platform_user_id),
  -- The handle is kept only while the person has chosen to show it.
  check (show_handle or handle is null)
);

-- 2. Relink cooldown: 30 days after an unlink, that social account can't be linked to a different person.
-- Keyed by an HMAC of the platform id (secret in Vercel, Sensitive), so nothing readable outlives the link.
create table if not exists public.social_link_cooldowns (
  platform text not null check (platform in ('x', 'threads', 'instagram', 'facebook')),
  id_hmac text not null check (id_hmac ~ '^[0-9a-f]{64}$'),
  previous_user uuid,            -- the same person may relink at once; anyone else waits
  until_at timestamptz not null,
  primary key (platform, id_hmac)
);

-- 3. Ingest ledger: one row per counted reply. Unlinked replies never get here.
create table if not exists public.social_votes (
  platform text not null check (platform in ('x', 'threads', 'instagram', 'facebook')),
  reply_id text not null check (reply_id ~ '^[0-9_]{1,64}$'),
  post_id text not null check (post_id ~ '^[0-9_]{1,64}$'),     -- OUR post; the reader checks it's in content's socialPosts
  user_id uuid not null references auth.users (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  probability smallint not null check (probability between 1 and 99),
  replied_at timestamptz not null,
  seen_at timestamptz not null default now(),
  primary key (platform, reply_id)
);
create index if not exists social_votes_user_slug on public.social_votes (user_id, slug);

-- RLS: a person reads only their own rows. No write policies: only the server (secret key) writes.
alter table public.social_links enable row level security;
alter table public.social_link_cooldowns enable row level security;
alter table public.social_votes enable row level security;

drop policy if exists "social_links: read own" on public.social_links;
create policy "social_links: read own" on public.social_links for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "social_votes: read own" on public.social_votes;
create policy "social_votes: read own" on public.social_votes for select to authenticated
  using ((select auth.uid()) = user_id);
-- Cooldowns: no policies at all (server only).

revoke all on public.social_links from public, anon;
revoke all on public.social_link_cooldowns from public, anon;
revoke all on public.social_votes from public, anon;
revoke insert, update, delete on public.social_links, public.social_votes from authenticated;
revoke all on public.social_link_cooldowns from authenticated;

-- 4. Unlinking: the server deletes the social_links row and writes a cooldown row in the same transaction.
-- Calls already made stay the person's own; unlinking only stops new replies counting. Account deletion cascades.
-- A deleted reply: the reader deletes its social_votes row and, if that reply set the current call, removes the call.

-- 5. Counting a reply, all in the database so the rules hold whatever the app does.
-- Called by the cron reader with the secret key only. Returns 'counted', 'website_wins', 'closed' or 'duplicate'.
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
  if uid is null then return 'unlinked'; end if;   -- the app must also drop it before calling; nothing is stored

  -- Same close time as the website. A reply written after the close never counts, even if read later.
  select w.closes_at into closes from public.question_windows w where w.slug = p_slug;
  if closes is null or p_replied_at >= closes or now() >= closes then return 'closed'; end if;
  -- A reply can't predate the link (stops "link after the fact" on old replies).
  if p_replied_at < (select l.linked_at from public.social_links l where l.platform = p_platform and l.user_id = uid) then
    return 'before_link';
  end if;

  insert into public.social_votes (platform, reply_id, post_id, user_id, slug, probability, replied_at)
  values (p_platform, p_reply_id, p_post_id, uid, p_slug, p_probability, p_replied_at)
  on conflict (platform, reply_id) do nothing;   -- edits ignored: the first parse stands
  if not found then return 'duplicate'; end if;

  select c.source into existing_source from public.calls c where c.user_id = uid and c.slug = p_slug;
  if existing_source = 'web' then return 'website_wins'; end if;

  -- Latest reply wins among social replies (older replies read late don't overwrite newer ones).
  if exists (select 1 from public.social_votes v where v.user_id = uid and v.slug = p_slug and v.replied_at > p_replied_at) then
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
-- NOTE for FORGE: the 2-second rate trigger on calls will refuse a second social update inside 2 s for the same
-- person. The reader handles 'too many changes' by retrying next cycle, which is fine at a daily cadence.
-- NOTE: once a web call exists, a website call made AFTER a social one flips source to 'web' through the normal
-- web write path. The web upsert must set source = 'web' explicitly.

-- 6. Sponsor numbers: per question × platform, aggregates only, every shown cell ≥ 50 (LEX), never user-level.
-- The per-platform split goes beyond the public page, so only people with a live dataLicensing consent are counted.
-- Smaller cells fold into 'other'; if 'other' is still under 50 it's hidden, and then the total is hidden too, so no
-- hidden cell can be worked out by subtraction. Political questions are filtered out by the app before calling this
-- (the slug list it passes must come from content where political = false; a unit test checks that).
create or replace function public.sponsor_social_counts(p_slugs text[])
returns table (slug text, source text, people bigint)
language sql stable security definer set search_path = '' as $$
  with licensed as (
    select c.slug, c.source
    from public.calls c
    join auth.users u on u.id = c.user_id
    where c.slug = any (p_slugs)
      and exists (select 1 from public.consent_log l
                  where l.email_hash = public.email_hash(u.email) and l.kind = 'dataLicensing' and l.withdrawn_at is null)
  ),
  raw as (select slug, source, count(*)::bigint as n from licensed group by slug, source),
  folded as (
    select slug, case when n >= 50 then source else 'other' end as source, sum(n)::bigint as n
    from raw group by 1, 2
  ),
  flags as (select slug, bool_or(source = 'other' and n < 50) as other_hidden from folded group by slug)
  select f.slug, f.source, case when f.n >= 50 then f.n end from folded f
  union all
  select f.slug, 'total', case when g.other_hidden then null else sum(f.n)::bigint end
  from folded f join flags g using (slug) group by f.slug, g.other_hidden
$$;
revoke execute on function public.sponsor_social_counts(text[]) from public, anon, authenticated;
grant execute on function public.sponsor_social_counts(text[]) to service_role;

-- 6b. Auto-reply de-duplication (LEX: hashed id, 7 days max). Server only, no policies.
create table if not exists public.social_autoreply_seen (
  platform text not null check (platform in ('x', 'threads', 'instagram', 'facebook')),
  id_hmac text not null check (id_hmac ~ '^[0-9a-f]{64}$'),
  post_id text not null check (post_id ~ '^[0-9_]{1,64}$'),
  seen_at timestamptz not null default now(),
  primary key (platform, id_hmac, post_id)
);
alter table public.social_autoreply_seen enable row level security;
revoke all on public.social_autoreply_seen from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname = 'consensa-expire-autoreply-seen';
select cron.schedule('consensa-expire-autoreply-seen', '50 4 * * *',
  $$delete from public.social_autoreply_seen where seen_at < now() - interval '7 days'$$);

-- 7. New consent kind for the linking box (append-only log unchanged).
alter table public.consent_log drop constraint if exists consent_log_kind_check;
alter table public.consent_log add constraint consent_log_kind_check
  check (kind in ('terms', 'dataLicensing', 'analytics', 'marketing', 'socialLink'));

-- 8. Cooldowns expire on their own: nightly at 04:40 UTC, after the unconfirmed-sign-up purge.
select cron.unschedule(jobid) from cron.job where jobname = 'consensa-expire-social-cooldowns';
select cron.schedule('consensa-expire-social-cooldowns', '40 4 * * *',
  $$delete from public.social_link_cooldowns where until_at < now()$$);

-- 9. Retention: the ledger is only needed while a question is open (idempotency, deleted replies).
-- 30 days after a question closes its social_votes rows go; the call itself stays like any call.
select cron.unschedule(jobid) from cron.job where jobname = 'consensa-trim-social-votes';
select cron.schedule('consensa-trim-social-votes', '45 4 * * *', $$
  delete from public.social_votes v using public.question_windows w
  where w.slug = v.slug and w.closes_at < now() - interval '30 days'
$$);

-- 10. Link and unlink, each in one transaction (the relink cooldown can't be skipped by a half-finished request).
-- The app passes an HMAC of the platform id (its secret stays in Vercel). Returns 'linked', 'already', 'taken'
-- (that social account belongs to another person) or 'cooldown' (unlinked from another person under 30 days ago).
create or replace function public.link_social_account(p_user uuid, p_platform text, p_platform_user_id text, p_id_hmac text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  owner uuid;
begin
  select l.user_id into owner from public.social_links l
  where l.platform = p_platform and l.platform_user_id = p_platform_user_id;
  if owner = p_user then return 'already'; end if;
  if owner is not null then return 'taken'; end if;
  if exists (select 1 from public.social_links l where l.user_id = p_user and l.platform = p_platform) then return 'already'; end if;
  if exists (select 1 from public.social_link_cooldowns c
             where c.platform = p_platform and c.id_hmac = p_id_hmac and c.until_at > now()
               and c.previous_user is distinct from p_user) then
    return 'cooldown';
  end if;
  insert into public.social_links (user_id, platform, platform_user_id) values (p_user, p_platform, p_platform_user_id);
  return 'linked';
exception when unique_violation then
  return 'taken';
end;
$$;
revoke execute on function public.link_social_account(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.link_social_account(uuid, text, text, text) to service_role;

-- Unlinking deletes the id at once and starts the 30-day cooldown. Calls already made stay the person's own.
create or replace function public.unlink_social_account(p_user uuid, p_platform text, p_id_hmac text)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.social_links l where l.user_id = p_user and l.platform = p_platform;
  if not found then return false; end if;
  insert into public.social_link_cooldowns (platform, id_hmac, previous_user, until_at)
  values (p_platform, p_id_hmac, p_user, now() + interval '30 days')
  on conflict (platform, id_hmac) do update set previous_user = excluded.previous_user, until_at = excluded.until_at;
  return true;
end;
$$;
revoke execute on function public.unlink_social_account(uuid, text, text) from public, anon, authenticated;
grant execute on function public.unlink_social_account(uuid, text, text) to service_role;

-- 11. A deleted reply (AEGIS note 6): its ledger row goes, and if that reply set the current call, the call goes back
-- to the person's latest remaining reply, or is removed when there is none. Only while the question is open: after
-- the close a call is part of the record and can't be taken back, the same as on the website.
-- Returns 'unknown', 'closed', 'removed' (ledger only), 'restored' or 'call_removed'.
create or replace function public.remove_social_reply(p_platform text, p_reply_id text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  gone public.social_votes%rowtype;
  latest public.social_votes%rowtype;
  closes timestamptz;
  call_source text;
begin
  select * into gone from public.social_votes v where v.platform = p_platform and v.reply_id = p_reply_id for update;
  if not found then return 'unknown'; end if;
  select w.closes_at into closes from public.question_windows w where w.slug = gone.slug;
  if closes is null or now() >= closes then return 'closed'; end if;

  select c.source into call_source from public.calls c where c.user_id = gone.user_id and c.slug = gone.slug;
  select * into latest from public.social_votes v
  where v.user_id = gone.user_id and v.slug = gone.slug order by v.replied_at desc, v.seen_at desc limit 1;
  delete from public.social_votes v where v.platform = p_platform and v.reply_id = p_reply_id;
  -- A website call, or a newer reply, set the current call: nothing else changes.
  if call_source is null or call_source = 'web' or latest.platform <> gone.platform or latest.reply_id <> gone.reply_id then
    return 'removed';
  end if;

  select * into latest from public.social_votes v
  where v.user_id = gone.user_id and v.slug = gone.slug order by v.replied_at desc, v.seen_at desc limit 1;
  if found then
    update public.calls c set probability = latest.probability, source = latest.platform
    where c.user_id = gone.user_id and c.slug = gone.slug and c.source <> 'web';
    return 'restored';
  end if;
  delete from public.calls c where c.user_id = gone.user_id and c.slug = gone.slug and c.source <> 'web';
  return 'call_removed';
end;
$$;
revoke execute on function public.remove_social_reply(text, text) from public, anon, authenticated;
grant execute on function public.remove_social_reply(text, text) to service_role;

-- 12. Where the reader is on each official post, and the post's native poll totals (totals only, as the platform
-- reports them; never mixed into "Canada says"). Server only, no policies. No per-voter data.
create table if not exists public.social_post_reads (
  platform text not null check (platform in ('x', 'threads', 'instagram', 'facebook')),
  post_id text not null check (post_id ~ '^[0-9_]{1,64}$'),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{2,79}$'),
  read_through timestamptz,           -- replies up to here have been read (and paid for) once
  poll_yes integer check (poll_yes is null or poll_yes >= 0),
  poll_no integer check (poll_no is null or poll_no >= 0),
  poll_read_at timestamptz,
  primary key (platform, post_id)
);
alter table public.social_post_reads enable row level security;
revoke all on public.social_post_reads from public, anon, authenticated;

-- 13. The spend counter (AEGIS note 7): what the paid reads have cost this month, in millionths of a US dollar.
-- It lives here, not in server memory, so every server instance and every cycle sees the same total.
-- This is our own API bill. It is not something a person holds, earns or can move.
create table if not exists public.social_spend (
  platform text not null check (platform in ('x', 'threads', 'instagram', 'facebook')),
  month date not null check (extract(day from month) = 1),
  spent_micros bigint not null default 0 check (spent_micros >= 0),
  primary key (platform, month)
);
alter table public.social_spend enable row level security;
revoke all on public.social_spend from public, anon, authenticated;

-- Reserves p_micros before a paid read, in one statement, and refuses when that would pass the cap. A negative
-- p_micros hands back what a read didn't use. Returns true when the read may go ahead.
create or replace function public.reserve_social_spend(p_platform text, p_month date, p_micros bigint, p_cap_micros bigint)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_micros <= 0 then
    update public.social_spend s set spent_micros = greatest(0, s.spent_micros + p_micros)
    where s.platform = p_platform and s.month = p_month;
    return true;
  end if;
  insert into public.social_spend (platform, month) values (p_platform, p_month) on conflict do nothing;
  update public.social_spend s set spent_micros = s.spent_micros + p_micros
  where s.platform = p_platform and s.month = p_month and s.spent_micros + p_micros <= p_cap_micros;
  return found;
end;
$$;
revoke execute on function public.reserve_social_spend(text, date, bigint, bigint) from public, anon, authenticated;
grant execute on function public.reserve_social_spend(text, date, bigint, bigint) to service_role;
