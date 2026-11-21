-- Social poll finder (FORGE, 2026-11-21; ca-central-1).
-- Run after 20261120001000_social_sweep_withdrawals.sql, before turning on SOCIAL_VOTING. Safe to run again.
--
-- zack posts YES/NO polls by hand on @CANsensus with a question's link in the post. The daily cycle finds them,
-- reads their totals (X and Threads polls, Instagram polls or YES/NO comments, Facebook 👍/😢 reactions), and the
-- question page shows them under "On social media" (never in "Canada says").
-- The totals already have a home (public.social_post_reads.poll_yes / poll_no / poll_read_at). This adds when the
-- poll ends, so the page can say whether the totals are final and keep a sports poll that ran past the start of
-- the game off the page (LEX, pre-game only), where the totals came from (a poll, reactions or comments), and our
-- own post's address (Instagram and Threads ids don't make one). Totals only: no names, text or ids of people.
--
-- Nothing here is public: the table stays row-level-secured with nothing granted to the public key, and the page
-- reads it through the server only.

alter table public.social_post_reads add column if not exists poll_ends_at timestamptz;
alter table public.social_post_reads add column if not exists poll_source text
  check (poll_source is null or poll_source in ('poll', 'reactions', 'comments'));
alter table public.social_post_reads add column if not exists post_url text
  check (post_url is null or (post_url ~ '^https://' and length(post_url) <= 300));
