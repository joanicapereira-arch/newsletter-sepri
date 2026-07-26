create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'sepri-daily-scan',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://sepri-legis-digest.lovable.app/api/public/cron-scan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'sepri-cron-a9df0d8d416d5080e1d96b41'
    ),
    body := '{}'::jsonb
  );
  $$
);