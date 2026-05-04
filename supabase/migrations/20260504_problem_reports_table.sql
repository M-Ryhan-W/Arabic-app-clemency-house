-- ============================================================================
-- Problem reports table + atomic 5/day rate limit
-- ============================================================================
-- Replaces the earlier counter-on-daily_usage approach (which had a read-then-
-- write race window and silently no-op'd if the migration wasn't applied).
-- Each report is now its own row, and a BEFORE INSERT trigger atomically
-- enforces the 5/day cap.
-- ============================================================================

create table if not exists public.problem_reports (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    message text not null,
    created_at timestamptz not null default now()
);

create index if not exists idx_problem_reports_user_created
    on public.problem_reports (user_id, created_at desc);

alter table public.problem_reports enable row level security;

drop policy if exists "Users can insert own problem reports" on public.problem_reports;
create policy "Users can insert own problem reports"
    on public.problem_reports for insert
    with check (auth.uid() = user_id);

drop policy if exists "Users can view own problem reports" on public.problem_reports;
create policy "Users can view own problem reports"
    on public.problem_reports for select
    using (auth.uid() = user_id);

-- Atomic 5/day cap. Counts existing rows for this user since midnight (server
-- time) and raises if the new insert would push the user over the limit.
create or replace function public.enforce_problem_report_daily_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    todays_count int;
    daily_limit  constant int := 5;
begin
    select count(*)
    into todays_count
    from public.problem_reports
    where user_id = new.user_id
      and created_at >= date_trunc('day', now());

    if todays_count >= daily_limit then
        raise exception
            'daily_problem_report_limit_reached: You''ve reached your daily report limit. Please try again tomorrow.'
            using errcode = 'P0001';
    end if;

    return new;
end;
$$;

drop trigger if exists enforce_problem_report_daily_limit on public.problem_reports;
create trigger enforce_problem_report_daily_limit
    before insert on public.problem_reports
    for each row
    when (new.user_id is not null)
    execute function public.enforce_problem_report_daily_limit();
