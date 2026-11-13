-- Homesly Skills Check: database schema
-- Run once on a new Supabase project (SQL Editor, or `npx supabase db push`).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- 1. Only company email addresses may create an account
-- ---------------------------------------------------------------
create or replace function public.enforce_company_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email is null or lower(new.email) not like '%@homeslystays.com' then
    raise exception 'Only @homeslystays.com email addresses can sign in';
  end if;
  return new;
end $$;

drop trigger if exists enforce_company_email on auth.users;
create trigger enforce_company_email
  before insert or update of email on auth.users
  for each row execute function public.enforce_company_email();

-- ---------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------
create table if not exists public.staff (
  email      text primary key check (email = lower(email) and email like '%@homeslystays.com'),
  full_name  text not null,
  role       text not null check (role in ('manager','employee')),
  emp_key    text check (emp_key in ('harshith','sai')),
  created_at timestamptz not null default now(),
  check (role = 'manager' or emp_key is not null)
);

create table if not exists public.questions (
  id          text primary key,
  emp_key     text not null,
  site        text not null,
  area        text not null,
  level       int  not null check (level between 1 and 3),
  type        text not null check (type in ('single','multi','truefalse','order','short')),
  prompt      text not null,
  code        text,
  options     jsonb,
  answer      jsonb,
  rubric      jsonb,
  explanation text,
  source      text,
  retired     boolean not null default false,
  updated_at  timestamptz not null default now()
);
create index if not exists questions_emp_idx on public.questions (emp_key) where not retired;

create table if not exists public.facts (
  id       text primary key,
  emp_key  text not null,
  site     text not null,
  site_name text,
  area     text not null,
  fact     text not null,
  source   text,
  updated_at timestamptz not null default now()
);

create table if not exists public.site_info (
  domain  text primary key,
  emp_key text not null,
  name    text,
  place   text,
  stack   text,
  summary text
);

create table if not exists public.tests (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade,
  email            text not null,
  emp_key          text not null,
  kind             text not null default 'daily' check (kind in ('daily','practice')),
  test_date        date not null,
  status           text not null default 'in_progress' check (status in ('in_progress','done')),
  started_at       timestamptz not null default now(),
  deadline_at      timestamptz not null,
  submitted_at     timestamptz,
  auto_submitted   boolean not null default false,
  questions        jsonb not null,          -- full questions incl. answers: never readable by the browser
  questions_public jsonb not null,          -- what the browser sees while the test runs
  answers          jsonb not null default '{}',
  conf             jsonb not null default '{}',
  flags            jsonb not null default '{}',
  integrity        jsonb not null default '{"tabAways":0,"pastes":0}',
  cur              int  not null default 0,
  grades           jsonb,
  score            jsonb,
  review           jsonb                     -- questions + answers + explanations, filled on submit
);
create unique index if not exists tests_one_daily_per_day on public.tests (user_id, test_date) where kind = 'daily';
create index if not exists tests_user_idx on public.tests (user_id, test_date desc);

create table if not exists public.learner_stats (
  user_id        uuid primary key references auth.users on delete cascade,
  email          text not null,
  emp_key        text not null,
  seen_ids       text[] not null default '{}',
  wrong_ids      text[] not null default '{}',
  used_facts     text[] not null default '{}',
  recent_prompts text[] not null default '{}',
  area_stats     jsonb  not null default '{}',
  history        jsonb  not null default '[]',
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------
create or replace function public.my_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where email = public.my_email() and role = 'manager')
$$;

create or replace function public.my_emp_key() returns text
language sql stable security definer set search_path = public as $$
  select emp_key from public.staff where email = public.my_email()
$$;

-- ---------------------------------------------------------------
-- 4. Row level security
-- ---------------------------------------------------------------
alter table public.staff         enable row level security;
alter table public.questions     enable row level security;
alter table public.facts         enable row level security;
alter table public.site_info     enable row level security;
alter table public.tests         enable row level security;
alter table public.learner_stats enable row level security;

drop policy if exists staff_read on public.staff;
create policy staff_read on public.staff for select to authenticated
  using (email = public.my_email() or public.is_manager());
drop policy if exists staff_write on public.staff;
create policy staff_write on public.staff for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- Question bank: managers only (employees never read answers)
drop policy if exists questions_manager on public.questions;
create policy questions_manager on public.questions for select to authenticated
  using (public.is_manager());

-- Study notes: each person reads their own sites' facts
drop policy if exists facts_read on public.facts;
create policy facts_read on public.facts for select to authenticated
  using (emp_key = public.my_emp_key() or public.is_manager());
drop policy if exists site_info_read on public.site_info;
create policy site_info_read on public.site_info for select to authenticated
  using (emp_key = public.my_emp_key() or public.is_manager());

drop policy if exists tests_read on public.tests;
create policy tests_read on public.tests for select to authenticated
  using (user_id = auth.uid() or public.is_manager());

drop policy if exists stats_read on public.learner_stats;
create policy stats_read on public.learner_stats for select to authenticated
  using (user_id = auth.uid() or public.is_manager());

-- Column privileges: the full `questions` column (with answers) is never readable from the browser
revoke all on public.tests from anon, authenticated;
grant select (id, user_id, email, emp_key, kind, test_date, status, started_at, deadline_at, submitted_at,
              auto_submitted, questions_public, answers, conf, flags, integrity, cur, grades, score, review)
  on public.tests to authenticated;
revoke all on public.questions, public.facts, public.site_info, public.learner_stats from anon;
revoke insert, update, delete on public.questions, public.facts, public.site_info, public.learner_stats from authenticated;
grant select on public.questions, public.facts, public.site_info, public.learner_stats to authenticated;
revoke all on public.staff from anon;
grant select, insert, update, delete on public.staff to authenticated;

-- ---------------------------------------------------------------
-- 5. Autosave while a test runs (answers only; marking happens on the server)
-- ---------------------------------------------------------------
create or replace function public.save_progress(
  p_test uuid, p_answers jsonb, p_conf jsonb, p_flags jsonb, p_integrity jsonb, p_cur int)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.tests
     set answers   = coalesce(p_answers, answers),
         conf      = coalesce(p_conf, conf),
         flags     = coalesce(p_flags, flags),
         integrity = coalesce(p_integrity, integrity),
         cur       = coalesce(p_cur, cur)
   where id = p_test and user_id = auth.uid() and status = 'in_progress'
     and now() <= deadline_at + interval '30 seconds';
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke all on function public.save_progress(uuid, jsonb, jsonb, jsonb, jsonb, int) from public, anon;
grant execute on function public.save_progress(uuid, jsonb, jsonb, jsonb, jsonb, int) to authenticated;
