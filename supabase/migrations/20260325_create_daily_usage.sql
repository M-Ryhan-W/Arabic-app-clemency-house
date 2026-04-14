-- Daily usage tracking for rate limiting
create table if not exists public.daily_usage (
    user_id uuid not null references auth.users(id) on delete cascade,
    usage_date date not null default current_date,
    scenario_sessions int not null default 0,
    total_requests int not null default 0,
    primary key (user_id, usage_date)
);

-- RLS: users can only see/modify their own usage
alter table public.daily_usage enable row level security;

create policy "Users can view own usage"
    on public.daily_usage for select
    using (auth.uid() = user_id);

create policy "Users can insert own usage"
    on public.daily_usage for insert
    with check (auth.uid() = user_id);

create policy "Users can update own usage"
    on public.daily_usage for update
    using (auth.uid() = user_id);

-- Index for fast lookups
create index if not exists idx_daily_usage_date on public.daily_usage(usage_date);

-- Auto-cleanup: delete rows older than 30 days (optional, run via cron or manually)
-- delete from public.daily_usage where usage_date < current_date - interval '30 days';
