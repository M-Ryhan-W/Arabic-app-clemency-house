-- Add a per-user-per-day counter for "Report a Problem" submissions.
-- Capped at 5/day in the report-problem Edge Function.
alter table public.daily_usage
    add column if not exists problem_reports int not null default 0;
