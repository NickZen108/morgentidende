alter table public.articles
  add column if not exists production_usage jsonb not null default '{}'::jsonb;
