-- Row-level security and call-rule check (AEGIS rules 1 and 4). Run in the Supabase SQL editor after the migrations.
-- It makes two throwaway people, gives each a call, then proves that the anon key reads nothing and a signed-in
-- person reads only their own rows and can't write any. It also deletes one test account. Everything runs in a transaction that is rolled back,
-- so nothing is left behind. Any failed check stops the script with an error naming it.

begin;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-00000000000a', 'rls-a@example.invalid', '{"adult": true, "terms": true, "locale": "en", "region": "ON"}'),
  ('00000000-0000-4000-8000-00000000000b', 'rls-b@example.invalid', '{"adult": true, "terms": true, "locale": "fr", "region": "QC"}');
insert into public.question_windows (slug, closes_at) values ('rls-check', now() + interval '1 day'), ('rls-closed', now() - interval '1 minute');
insert into public.calls (user_id, slug, probability)
values ('00000000-0000-4000-8000-00000000000a', 'rls-check', 40), ('00000000-0000-4000-8000-00000000000b', 'rls-check', 70);

-- The database refuses a call on a closed question, one with no close time, and a change within 2 seconds.
do $$ begin
  begin
    insert into public.calls (user_id, slug, probability) values ('00000000-0000-4000-8000-00000000000a', 'rls-closed', 50);
    raise exception 'FAILED: a call was saved after its question closed';
  exception when raise_exception then
    if sqlerrm like 'FAILED%' then raise; end if;
  end;
  begin
    insert into public.calls (user_id, slug, probability) values ('00000000-0000-4000-8000-00000000000a', 'rls-unknown', 50);
    raise exception 'FAILED: a call was saved on a question with no close time';
  exception when raise_exception then
    if sqlerrm like 'FAILED%' then raise; end if;
  end;
  begin
    update public.calls set probability = 41 where user_id = '00000000-0000-4000-8000-00000000000a' and slug = 'rls-check';
    raise exception 'FAILED: a call was changed twice within 2 seconds';
  exception when raise_exception then
    if sqlerrm like 'FAILED%' then raise; end if;
  end;
end $$;

-- A signup without the 18+ yes is refused by the trigger.
do $$ begin
  insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-4000-8000-00000000000c', 'rls-c@example.invalid', '{"terms": true}');
  raise exception 'FAILED: an account was created without the 18+ check';
exception when check_violation then null;
end $$;

-- The anon key sees nothing.
set local role anon;
do $$ begin
  begin
    perform 1 from public.calls;
    raise exception 'FAILED: anon can query calls';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Person A sees only their own call, can't see B's, and can't write.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000000a", "role": "authenticated", "email": "rls-a@example.invalid"}', true);
do $$ begin
  if (select count(*) from public.calls) <> 1 then raise exception 'FAILED: a person can read calls that are not theirs'; end if;
  if exists (select 1 from public.calls where user_id <> '00000000-0000-4000-8000-00000000000a') then raise exception 'FAILED: saw another person''s call'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'FAILED: a person can read other profiles'; end if;
  if exists (select 1 from public.consent_log where email_hash <> public.email_hash('rls-a@example.invalid')) then raise exception 'FAILED: saw another person''s consents'; end if;
  begin
    update public.calls set probability = 99;
    raise exception 'FAILED: a person can edit calls from the browser';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.crowd_summary(array['rls-check']);
    raise exception 'FAILED: the browser can call crowd_summary';
  exception when insufficient_privilege or undefined_function then null;
  end;
end $$;
reset role;

-- Deleting an account keeps its consent rows (CASL proof), and the log refuses deletes.
delete from auth.users where id = '00000000-0000-4000-8000-00000000000b';
do $$ begin
  if not exists (select 1 from public.consent_log where email_hash = public.email_hash('rls-b@example.invalid')) then raise exception 'FAILED: consent records were deleted with the account'; end if;
  if exists (select 1 from public.calls where user_id = '00000000-0000-4000-8000-00000000000b') then raise exception 'FAILED: calls survived account deletion'; end if;
  begin
    delete from public.consent_log;
    raise exception 'FAILED: consent rows can be deleted';
  exception when raise_exception then
    if sqlerrm like 'FAILED%' then raise; end if;
  end;
end $$;

select 'RLS check passed' as result;
rollback;
