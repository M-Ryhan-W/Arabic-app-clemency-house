create extension if not exists pg_cron;

create or replace function public.purge_old_community_posts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.community_posts
  where created_at < now() - interval '7 days';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

drop policy if exists "Read recent posts" on public.community_posts;

create policy "Read recent posts" on public.community_posts
  for select
  using (created_at > now() - interval '7 days');

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'purge-old-community-posts';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'purge-old-community-posts',
    '17 2 * * *',
    $cron$select public.purge_old_community_posts();$cron$
  );
end;
$$;

select public.purge_old_community_posts();
