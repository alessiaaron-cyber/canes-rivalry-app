-- pg_cron does not automatically prune cron.job_run_details.
-- Retain seven days of execution history to keep the Free Plan database small.

do $migration$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'cleanup-cron-job-run-details';

  if existing_job_id is null then
    perform cron.schedule(
      'cleanup-cron-job-run-details',
      '10 4 * * *',
      $job$
        delete from cron.job_run_details
        where start_time < now() - interval '7 days';
      $job$
    );
  else
    perform cron.alter_job(
      job_id := existing_job_id,
      schedule := '10 4 * * *',
      command := $job$
        delete from cron.job_run_details
        where start_time < now() - interval '7 days';
      $job$,
      active := true
    );
  end if;
end
$migration$;

delete from cron.job_run_details
where start_time < now() - interval '7 days';
