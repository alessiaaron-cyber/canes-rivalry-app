-- Keep scheduled Edge Function credentials out of cron.job.
-- Provision these project-level Vault secrets before applying:
--   canes_cron_secret
--   canes_dispatch_bearer
--   canes_dispatch_api_key

do $migration$
begin
  if (
    select count(*)
    from vault.secrets
    where name in (
      'canes_cron_secret',
      'canes_dispatch_bearer',
      'canes_dispatch_api_key'
    )
  ) <> 3 then
    raise exception 'Required Canes Rivalry Vault secrets are not provisioned';
  end if;

  if (
    select count(*)
    from cron.job
    where jobname in (
      'auto-sync-current-game-every-minute',
      'dispatch-delayed-notifications-every-minute'
    )
  ) <> 2 then
    raise exception 'Required Canes Rivalry cron jobs are not present';
  end if;

  perform cron.alter_job(
    job_id := (
      select jobid from cron.job
      where jobname = 'auto-sync-current-game-every-minute'
    ),
    command := $auto_job$
      select net.http_post(
        url := 'https://hhhxgbztfizmwxbuoprq.functions.supabase.co/auto-sync-current-game',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'canes_cron_secret'
          )
        ),
        body := '{}'::jsonb
      );
    $auto_job$
  );

  perform cron.alter_job(
    job_id := (
      select jobid from cron.job
      where jobname = 'dispatch-delayed-notifications-every-minute'
    ),
    command := $dispatch_job$
      select net.http_post(
        url := 'https://hhhxgbztfizmwxbuoprq.supabase.co/functions/v1/dispatch-delayed-notifications',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'canes_dispatch_bearer'
          ),
          'apikey', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'canes_dispatch_api_key'
          ),
          'x-cron-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'canes_cron_secret'
          )
        ),
        body := '{}'::jsonb
      );
    $dispatch_job$
  );
end
$migration$;
