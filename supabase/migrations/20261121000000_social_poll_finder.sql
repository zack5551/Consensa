-- Social poll finder (FORGE, 2026-11-21; ca-central-1).
-- Run after 20261120001000_social_sweep_withdrawals.sql, before turning on SOCIAL_VOTING. Safe to run again.
--
-- zack posts YES/NO polls by hand on @CANsensus with a question's link in the post. The daily cycle finds them,
-- reads their totals from X, and the question page shows them under "On social media" (never in "Canada says").
-- The totals already have a home (public.social_post_reads.poll_yes / poll_no / poll_read_at). This adds when the
-- poll ends, so the page can say whether the totals are final and keep a sports poll that ran past the start of
-- the game off the page (LEX, pre-game only).
--
-- Nothing here is public: the table stays row-level-secured with nothing granted to the public key, and the page
-- reads it through the server only.

alter table public.social_post_reads add column if not exists poll_ends_at timestamptz;
