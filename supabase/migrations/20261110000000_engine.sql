-- PULSE, the question engine: its state in Supabase (ca-central-1).
--
-- Run once in the Supabase dashboard: SQL Editor → New query → paste this file → Run.
--
-- Only the server reads or writes these tables, with the secret key, which bypasses row-level security. RLS is on
-- with no policies, so the public (anon) key and signed-in users can read nothing here. No table touches users or
-- points. Nothing is deleted (CLAUDE.md rule 6): every table refuses DELETE.
--
-- Editors review drafts in Table Editor → engine_queue: change `status` from pending to approved, rejected or
-- needsChanges. Approving acknowledges the flags shown in the `flags` column. The trigger below logs every change
-- with who and when, and the next engine cycle publishes approved drafts.

create table if not exists engine_signals (
  id text primary key,
  published_at timestamptz not null,
  signal jsonb not null,
  fetched_at timestamptz not null default now()
);
create index if not exists engine_signals_published_at on engine_signals (published_at desc);

-- One row per story the engine handled, so it never pays to draft the same story twice.
create table if not exists engine_story_runs (
  story_id text primary key,
  outcome text not null,
  decided_at timestamptz not null
);

create table if not exists engine_queue (
  id text primary key,
  slug text not null,
  question_en text not null,
  question_fr text not null,
  status text not null check (status in ('pending', 'approved', 'rejected', 'needsChanges', 'published', 'autoRejected')),
  priority smallint not null,
  flags jsonb not null,
  editor_note text not null default '',
  item jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists engine_queue_status on engine_queue (status, priority desc);

-- Append-only audit trail of status changes made in the dashboard.
create table if not exists engine_review_events (
  id bigint generated always as identity primary key,
  item_id text not null references engine_queue (id),
  at timestamptz not null default now(),
  actor text not null,
  from_status text,
  to_status text not null
);

create table if not exists engine_resolutions (
  slug text primary key,
  state text not null check (state in ('waiting', 'confirming', 'resolved', 'needsEditor')),
  outcome text check (outcome in ('yes', 'no')),
  record jsonb not null,
  updated_at timestamptz not null default now()
);

-- Questions the site shows, already in the site's question shape. The build reads this table.
create table if not exists engine_live_questions (
  slug text primary key,
  question jsonb not null,
  updated_at timestamptz not null default now()
);

-- Who changed a queue row's status by hand, for the audit trail.
create or replace function engine_log_review() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    insert into engine_review_events (item_id, actor, from_status, to_status)
    values (new.id, coalesce(auth.jwt() ->> 'email', current_user), old.status, new.status);
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists engine_queue_review on engine_queue;
create trigger engine_queue_review before update on engine_queue for each row execute function engine_log_review();

create or replace function engine_refuse_delete() returns trigger language plpgsql as $$
begin
  raise exception 'PULSE keeps every row for the audit trail; change status instead of deleting.';
end $$;

do $$
declare t text;
begin
  foreach t in array array['engine_signals', 'engine_story_runs', 'engine_queue', 'engine_review_events', 'engine_resolutions', 'engine_live_questions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
    execute format('drop trigger if exists %I on %I', t || '_no_delete', t);
    execute format('create trigger %I before delete on %I for each statement execute function engine_refuse_delete()', t || '_no_delete', t);
  end loop;
end $$;
