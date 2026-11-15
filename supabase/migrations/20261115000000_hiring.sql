-- Hiring assessments: roles (built from a JD), candidates with private invite links,
-- a proctored timed part (camera + screen captures) and a 48-hour take-home upload.
-- Candidates never sign in and never touch these tables: every candidate action goes through
-- the `api` Edge Function, which checks the invite token (stored here only as a SHA-256 hash).

create table if not exists public.hiring_roles (
  id          text primary key check (id ~ '^[a-z0-9-]{3,80}$'),
  title       text not null,
  summary     text,
  jd_text     text,
  pack        jsonb not null,                 -- brief, timed questions, tasks, scorecard, follow-ups
  status      text not null default 'live' check (status in ('draft','live','closed')),
  created_by  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.candidates (
  id                uuid primary key default gen_random_uuid(),
  role_id           text not null references public.hiring_roles on delete restrict,
  full_name         text not null,
  email             text,
  phone             text,
  cv_path           text,
  notes             text,
  pack              jsonb not null,           -- copy of the role pack at invite time, so later edits don't change a live assessment
  token_hash        text not null unique,
  link_expires_at   timestamptz not null,
  status            text not null default 'invited'
                    check (status in ('invited','accepted','part_a','part_a_done','submitted','hire','second_round','rejected')),
  accepted_at       timestamptz,
  deadline_at       timestamptz,              -- accepted_at + 48 h
  consent           jsonb,                    -- what they agreed to, when, from which browser
  timed_started_at  timestamptz,
  timed_deadline_at timestamptz,
  timed_submitted_at timestamptz,
  timed_auto        boolean not null default false,
  timed_answers     jsonb not null default '{}',
  timed_marks       jsonb,                    -- auto marks for numbers questions + AI suggestions for written answers
  integrity         jsonb not null default '{}',
  devices           jsonb not null default '[]',
  takehome          jsonb not null default '{"files":[],"links":[]}',
  submitted_at      timestamptz,
  review            jsonb not null default '{}',
  created_by        text,
  created_at        timestamptz not null default now()
);
create index if not exists candidates_role_idx on public.candidates (role_id, created_at desc);

create table if not exists public.candidate_captures (
  id           bigint generated always as identity primary key,
  candidate_id uuid not null references public.candidates on delete cascade,
  kind         text not null check (kind in ('cam','screen')),
  reason       text not null,                 -- 'interval', or the warning that triggered it
  t            int  not null default 0,       -- seconds into Part A
  path         text not null unique,
  created_at   timestamptz not null default now()
);
create index if not exists captures_cand_idx on public.candidate_captures (candidate_id, id);

alter table public.hiring_roles       enable row level security;
alter table public.candidates         enable row level security;
alter table public.candidate_captures enable row level security;

drop policy if exists roles_manager on public.hiring_roles;
create policy roles_manager on public.hiring_roles for all to authenticated
  using (public.is_manager()) with check (public.is_manager());
drop policy if exists candidates_manager on public.candidates;
create policy candidates_manager on public.candidates for select to authenticated using (public.is_manager());
drop policy if exists captures_manager on public.candidate_captures;
create policy captures_manager on public.candidate_captures for select to authenticated using (public.is_manager());

revoke all on public.hiring_roles, public.candidates, public.candidate_captures from anon, authenticated;
grant select, insert, update, delete on public.hiring_roles to authenticated;
-- Managers read candidates (never the token hash); all writes go through the Edge Function.
grant select (id, role_id, full_name, email, phone, cv_path, notes, pack, link_expires_at, status, accepted_at, deadline_at,
              consent, timed_started_at, timed_deadline_at, timed_submitted_at, timed_auto, timed_answers, timed_marks,
              integrity, devices, takehome, submitted_at, review, created_by, created_at)
  on public.candidates to authenticated;
grant select on public.candidate_captures to authenticated;

-- Private file store: CVs, camera and screen captures, take-home uploads. No public access and no
-- browser policies: files are written through signed upload URLs and read through short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit)
values ('hiring', 'hiring', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;
