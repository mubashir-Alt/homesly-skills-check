-- Pre-exam textbooks and reading progress.

create table if not exists public.textbooks (
  emp_key    text primary key check (emp_key in ('harshith','sai')),
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.reading_progress (
  user_id    uuid not null references auth.users on delete cascade,
  email      text not null,
  chapter_id text not null,
  read_at    timestamptz not null default now(),
  primary key (user_id, chapter_id)
);

alter table public.textbooks        enable row level security;
alter table public.reading_progress enable row level security;

drop policy if exists textbooks_read on public.textbooks;
create policy textbooks_read on public.textbooks for select to authenticated
  using (emp_key = public.my_emp_key() or public.is_manager());

drop policy if exists reading_read on public.reading_progress;
create policy reading_read on public.reading_progress for select to authenticated
  using (user_id = auth.uid() or public.is_manager());
drop policy if exists reading_write on public.reading_progress;
create policy reading_write on public.reading_progress for insert to authenticated
  with check (user_id = auth.uid() and email = public.my_email());
drop policy if exists reading_update on public.reading_progress;
create policy reading_update on public.reading_progress for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and email = public.my_email());

revoke all on public.textbooks, public.reading_progress from anon;
revoke insert, update, delete on public.textbooks from authenticated;
grant select on public.textbooks to authenticated;
grant select, insert, update on public.reading_progress to authenticated;
