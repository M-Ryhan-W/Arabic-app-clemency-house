alter table public.user_daily_stats
add column if not exists picture_completed boolean not null default false;
