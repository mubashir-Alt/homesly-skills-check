-- Weekly work: every Friday the refresh reads Monday–Thursday's commits from GitHub,
-- tags the new questions and facts with that week (its Monday), and records a summary here.
-- Friday's test is drawn mostly from that week; the following weekdays revise it.

alter table public.questions add column if not exists week date;
alter table public.facts     add column if not exists week date;
alter table public.tests     add column if not exists week date;   -- set when the test focused on a work week
create index if not exists questions_week_idx on public.questions (emp_key, week) where not retired;

create table if not exists public.work_weeks (
  emp_key       text not null check (emp_key in ('harshith','sai')),
  week          date not null,                 -- Monday of the work week
  from_date     date,
  to_date       date,
  commits       int  not null default 0,
  summary       text,
  highlights    jsonb not null default '[]',     -- short bullet list of what was done
  new_questions int  not null default 0,
  loaded_at     timestamptz not null default now(),
  primary key (emp_key, week)
);
alter table public.work_weeks enable row level security;
drop policy if exists work_weeks_read on public.work_weeks;
create policy work_weeks_read on public.work_weeks for select to authenticated
  using (emp_key = public.my_emp_key() or public.is_manager());
revoke all on public.work_weeks from anon;
revoke insert, update, delete on public.work_weeks from authenticated;
grant select on public.work_weeks to authenticated;

grant select (week) on public.tests to authenticated;
