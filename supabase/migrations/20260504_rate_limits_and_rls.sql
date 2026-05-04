-- ============================================================================
-- Rate limiting + RLS hardening
-- ============================================================================
-- Extends daily_usage with counters for the new rate-limited actions, adds
-- a trigger that caps community_corrections at 10/day per user, and ensures
-- user_daily_stats has RLS so users can only read/write their own row.
-- ============================================================================

-- 1) Extend daily_usage with extra counters used by the Edge Functions.
alter table public.daily_usage
    add column if not exists ai_feedback_requests int not null default 0,
    add column if not exists speech_checks        int not null default 0,
    add column if not exists corrections_submitted int not null default 0,
    add column if not exists emails_sent          int not null default 0;

-- 2) Community corrections daily limit (10/day, per user).
create or replace function public.enforce_correction_daily_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    todays_count int;
    daily_limit  constant int := 10;
begin
    select count(*)
    into todays_count
    from public.community_corrections
    where user_id = new.user_id
      and created_at >= date_trunc('day', now())
      and is_ai is not true;  -- AI feedback inserts shouldn't count toward the user limit

    if todays_count >= daily_limit then
        raise exception
            'daily_correction_limit_reached: You''ve reached your daily limit of % corrections. Come back tomorrow!', daily_limit
            using errcode = 'P0001';
    end if;

    return new;
end;
$$;

drop trigger if exists enforce_correction_daily_limit on public.community_corrections;
create trigger enforce_correction_daily_limit
    before insert on public.community_corrections
    for each row
    when (new.user_id is not null)
    execute function public.enforce_correction_daily_limit();

-- 3) Defensive RLS on user_daily_stats. The table was created outside of this
-- repo's migrations; if it already has RLS this is a no-op, otherwise it
-- locks it down so users only see/modify their own row.
do $$
begin
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'user_daily_stats') then
        execute 'alter table public.user_daily_stats enable row level security';
    end if;
end $$;

do $$
begin
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'user_daily_stats') then
        execute 'drop policy if exists "Users view own daily stats"   on public.user_daily_stats';
        execute 'drop policy if exists "Users insert own daily stats" on public.user_daily_stats';
        execute 'drop policy if exists "Users update own daily stats" on public.user_daily_stats';

        execute $policy$
            create policy "Users view own daily stats"
                on public.user_daily_stats for select
                using (auth.uid() = user_id)
        $policy$;
        execute $policy$
            create policy "Users insert own daily stats"
                on public.user_daily_stats for insert
                with check (auth.uid() = user_id)
        $policy$;
        execute $policy$
            create policy "Users update own daily stats"
                on public.user_daily_stats for update
                using (auth.uid() = user_id)
                with check (auth.uid() = user_id)
        $policy$;
    end if;
end $$;
