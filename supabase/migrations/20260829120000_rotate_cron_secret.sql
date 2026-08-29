-- O CRON_SECRET anterior estava em texto simples nesta pasta de migrações,
-- que agora é um repositório público no GitHub. Roda-se o segredo e
-- corrige-se também o URL (a app já não se chama "sepri-legis-digest").
--
-- IMPORTANTE: depois de aplicar esta migração, define a secret CRON_SECRET
-- no Lovable Cloud com o MESMO valor usado aqui em baixo, ou o endpoint
-- /api/public/cron-scan passa a rejeitar o cron diário (401 unauthorized).

select cron.unschedule('sepri-daily-scan');

select cron.schedule(
  'sepri-daily-scan',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://newsletter-sepri.lovable.app/api/public/cron-scan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '18d1d898dadbf06531fc400281504dc67c94ce1a56bc0f4d'
    ),
    body := '{}'::jsonb
  );
  $$
);
