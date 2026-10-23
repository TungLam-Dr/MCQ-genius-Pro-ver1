-- Chạy một lần trong Supabase SQL Editor. Không đưa API key vào SQL này.
create table if not exists public.mcq_shared_exams (
  id uuid primary key,
  title text not null,
  time_limit_minutes integer not null check (time_limit_minutes between 1 and 360),
  questions jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.mcq_shared_attempts (
  id uuid primary key,
  exam_id uuid not null references public.mcq_shared_exams(id) on delete cascade,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  correct_count integer,
  incorrect_count integer,
  skipped_count integer
);
create index if not exists mcq_shared_attempts_exam_idx on public.mcq_shared_attempts(exam_id);

alter table public.mcq_shared_exams enable row level security;
alter table public.mcq_shared_attempts enable row level security;
-- Không thêm policy công khai: chỉ Vercel Function với SUPABASE_SECRET_KEY truy cập bảng.
