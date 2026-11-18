-- How many calls come through a VPN or proxy (ca-central-1). Run after 20261111000100_crowd.sql (and after 20261118000000_error_events.sql if present). Safe to run again.
--
-- One counter row per day, never a row per person or per call. The app's server looks the visitor up in a local
-- database (nothing leaves Canada), then adds one to today's counts and forgets the address. Only the server's
-- secret key can call these functions.

create table if not exists public.call_origin_daily (
  day date primary key,
  total int not null default 0,   -- every accepted call that day
  vpn int not null default 0,     -- of those, came through a VPN or proxy
  unknown int not null default 0  -- of those, could not be checked (no way to tell)
);

alter table public.call_origin_daily enable row level security;
revoke all on public.call_origin_daily from public, anon, authenticated;

-- Adds one accepted call to today's row (Eastern time, like the site). p_vpn is 'yes', 'no' or 'unknown'.
create or replace function public.count_call_origin(p_vpn text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_vpn not in ('yes', 'no', 'unknown') then
    raise exception 'bad value';
  end if;
  insert into public.call_origin_daily as d (day, total, vpn, unknown)
  values ((now() at time zone 'America/Toronto')::date, 1, (p_vpn = 'yes')::int, (p_vpn = 'unknown')::int)
  on conflict (day) do update
    set total = d.total + 1,
        vpn = d.vpn + (p_vpn = 'yes')::int,
        unknown = d.unknown + (p_vpn = 'unknown')::int;
end
$$;

-- Totals for the last p_days days (1 to 366), today included. One row, no days, nothing per person.
create or replace function public.call_origin_share(p_days int)
returns table (total bigint, vpn bigint, unknown bigint)
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(d.total), 0)::bigint, coalesce(sum(d.vpn), 0)::bigint, coalesce(sum(d.unknown), 0)::bigint
  from public.call_origin_daily d
  where d.day > (now() at time zone 'America/Toronto')::date - greatest(1, least(coalesce(p_days, 30), 366))
$$;

revoke execute on function public.count_call_origin(text) from public, anon, authenticated;
grant execute on function public.count_call_origin(text) to service_role;
revoke execute on function public.call_origin_share(int) from public, anon, authenticated;
grant execute on function public.call_origin_share(int) to service_role;
