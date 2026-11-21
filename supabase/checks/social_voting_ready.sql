-- Is the database ready for social voting? (FORGE, 2026-11-20)
--
-- Read-only: this only looks, it changes nothing. Paste it into the Supabase SQL editor and press Run. Every row
-- should say ready = true. A false row names what is missing; the "step" column says which file fixes it.
--
-- It is not a migration and never runs by itself. Run it after the four social-voting migrations, in this order:
--   1. supabase/migrations/20261119000000_social_voting.sql
--   2. supabase/migrations/20261120000000_social_sweep_approval.sql
--   3. supabase/migrations/20261120001000_social_sweep_withdrawals.sql
--   4. supabase/migrations/20261121000000_social_poll_finder.sql
-- Needs pg_cron turned on (it has been since 2026-11-12).

with checks(step, item, ready) as (
  values
    -- 1. social_voting
    ('1', 'table social_links',            to_regclass('public.social_links') is not null),
    ('1', 'table social_votes',            to_regclass('public.social_votes') is not null),
    ('1', 'table social_spend',            to_regclass('public.social_spend') is not null),
    ('1', 'table social_post_reads',       to_regclass('public.social_post_reads') is not null),
    ('1', 'table social_link_cooldowns',   to_regclass('public.social_link_cooldowns') is not null),
    ('1', 'table social_autoreply_seen',   to_regclass('public.social_autoreply_seen') is not null),
    ('1', 'column calls.source',           exists (select 1 from information_schema.columns
                                                    where table_schema = 'public' and table_name = 'calls' and column_name = 'source')),
    ('1', 'function link_social_account',  exists (select 1 from pg_proc where proname = 'link_social_account' and pronamespace = 'public'::regnamespace)),
    ('1', 'function sponsor_social_counts', exists (select 1 from pg_proc where proname = 'sponsor_social_counts' and pronamespace = 'public'::regnamespace)),
    ('1', 'nightly clean-ups scheduled',   (select count(*) = 3 from cron.job where jobname in
                                              ('consensa-expire-autoreply-seen', 'consensa-expire-social-cooldowns', 'consensa-trim-social-votes'))),
    -- 2. social_sweep_approval
    ('2', 'table social_sweep_approval',   to_regclass('public.social_sweep_approval') is not null),
    -- 3. social_sweep_withdrawals
    ('3', 'table social_sweep_halt',       to_regclass('public.social_sweep_halt') is not null),
    ('3', 'table social_sweep_approval_log', to_regclass('public.social_sweep_approval_log') is not null),
    ('3', 'table social_reply_restore_log', to_regclass('public.social_reply_restore_log') is not null),
    ('3', 'table call_restore_pass',       to_regclass('public.call_restore_pass') is not null),
    ('3', 'columns held_at, withdrawn_at', (select count(*) = 2 from information_schema.columns
                                              where table_schema = 'public' and table_name = 'social_votes' and column_name in ('held_at', 'withdrawn_at'))),
    ('3', 'function restore_social_reply (3 arguments)', to_regprocedure('public.restore_social_reply(text, text, text)') is not null),
    ('3', 'function approve_social_sweep (2 arguments)', to_regprocedure('public.approve_social_sweep(text, text)') is not null),
    ('3', 'function purge_social_audit_logs', to_regprocedure('public.purge_social_audit_logs()') is not null),
    ('3', 'account deletion clears restore log ids', exists (select 1 from pg_trigger where tgname = 'on_auth_user_deleted_forget_social_restores')),
    -- Safety: only the owner, by hand in this editor, can approve a sweep or restore a reply. The app's key can't.
    ('3', 'app key cannot approve a sweep', to_regprocedure('public.approve_social_sweep(text, text)') is not null
                                          and not has_function_privilege('service_role', 'public.approve_social_sweep(text, text)', 'execute')),
    ('3', 'app key cannot restore a reply', to_regprocedure('public.restore_social_reply(text, text, text)') is not null
                                          and not has_function_privilege('service_role', 'public.restore_social_reply(text, text, text)', 'execute')),
    ('3', 'visitors cannot read the logs', to_regclass('public.social_reply_restore_log') is not null
                                          and not has_table_privilege('anon', 'public.social_reply_restore_log', 'select')
                                          and not has_table_privilege('authenticated', 'public.social_reply_restore_log', 'select')),
    -- 4. social_poll_finder
    ('4', 'columns poll_ends_at, poll_source, post_url', (select count(*) = 3 from information_schema.columns
                                                    where table_schema = 'public' and table_name = 'social_post_reads'
                                                      and column_name in ('poll_ends_at', 'poll_source', 'post_url')))
)
select step, item, ready from checks order by step, ready, item;
