-- Where each call was made from: Canada, or through a VPN or proxy (ca-central-1). Safe to run again.
-- Run first: 20261111000000_accounts.sql and 20261111000100_crowd.sql (it replaces crowd_summary).
-- 20261118000100_call_origin_counts.sql is separate and can run before or after.
--
-- `calls.origin` is 'canada' or 'vpn'. Only the app's server sets it (secret key); the browser has no write
-- rights on `calls`, and row-level security is untouched. No address or proxy type is stored, only this label.
-- Every Canada number (the total, the province and language splits) reads origin = 'canada' only. The World/VPN
-- group has its own function and is never mixed into "Canada says". The app applies the 5-person floor to both.

alter table public.calls add column if not exists origin text not null default 'canada';
alter table public.calls drop constraint if exists calls_origin_check;
alter table public.calls add constraint calls_origin_check check (origin in ('canada', 'vpn'));

-- Canada only. Same shape as before, so the app reads it unchanged.
create or replace function public.crowd_summary(p_slugs text[])
returns table (slug text, region text, locale text, n bigint, total bigint)
language sql stable security definer set search_path = '' as $$
  select c.slug, p.region, p.locale, count(*)::bigint, sum(c.probability)::bigint
  from public.calls c
  left join public.profiles p on p.id = c.user_id
  where c.slug = any (p_slugs)
    and c.origin = 'canada'
  group by c.slug, p.region, p.locale
$$;

-- The World/VPN group: one row per question, a count and a sum, never a row per person.
create or replace function public.crowd_world_vpn(p_slugs text[])
returns table (slug text, n bigint, total bigint)
language sql stable security definer set search_path = '' as $$
  select c.slug, count(*)::bigint, sum(c.probability)::bigint
  from public.calls c
  where c.slug = any (p_slugs)
    and c.origin = 'vpn'
  group by c.slug
$$;

revoke execute on function public.crowd_summary(text[]) from public, anon, authenticated;
grant execute on function public.crowd_summary(text[]) to service_role;
revoke execute on function public.crowd_world_vpn(text[]) from public, anon, authenticated;
grant execute on function public.crowd_world_vpn(text[]) to service_role;
