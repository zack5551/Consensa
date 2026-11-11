-- The crowd from real calls (ca-central-1). Run after 20261111000000_accounts.sql. Safe to run again.
--
-- Only the app's server can call this (secret key). It returns counts and sums per question, region and
-- language, never a row per person. The app shows a number only when at least 5 people are behind it, so a
-- single person's call can never be read off the page.

create or replace function public.crowd_summary(p_slugs text[])
returns table (slug text, region text, locale text, n bigint, total bigint)
language sql stable security definer set search_path = '' as $$
  select c.slug, p.region, p.locale, count(*)::bigint, sum(c.probability)::bigint
  from public.calls c
  left join public.profiles p on p.id = c.user_id
  where c.slug = any (p_slugs)
  group by c.slug, p.region, p.locale
$$;

revoke execute on function public.crowd_summary(text[]) from public, anon, authenticated;
grant execute on function public.crowd_summary(text[]) to service_role;
