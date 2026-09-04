create table if not exists public.editorial_orders (
  id uuid primary key default gen_random_uuid(),
  story_id uuid references public.stories(id) on delete set null,
  instruction text not null,
  requested_section text,
  requested_article_type text,
  requested_search_type text,
  requested_publish_at timestamptz,
  homepage_slot text,
  status text not null default 'pending',
  scan_calls integer not null default 0 check (scan_calls >= 0 and scan_calls <= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scan_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.editorial_orders(id) on delete cascade,
  story_id uuid references public.stories(id) on delete cascade,
  requested_by text not null check (requested_by in ('editor_in_chief','journalist','media','desk')),
  search_type text not null check (search_type in ('text','image','video','map_satellite')),
  query text not null,
  priority_stage text,
  attempt_no integer not null default 1,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.scan_results (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.scan_requests(id) on delete cascade,
  result_kind text not null check (result_kind in ('article','photo','video','map','satellite')),
  url text not null,
  title text,
  publisher text,
  summary text,
  published_at timestamptz,
  license text,
  commercial_use_allowed boolean,
  jurisdiction_note text,
  credit text,
  metadata jsonb not null default '{}'::jsonb,
  accepted boolean,
  created_at timestamptz not null default now()
);

alter table public.articles
  add column if not exists homepage_slot text,
  add column if not exists publish_instruction jsonb not null default '{}'::jsonb,
  add column if not exists source_metadata jsonb not null default '[]'::jsonb;

alter table public.media_assets
  add column if not exists rights_verified boolean not null default false,
  add column if not exists commercial_use_allowed boolean,
  add column if not exists jurisdiction_note text,
  add column if not exists hero_priority integer check (hero_priority between 1 and 6);

alter table public.editorial_orders enable row level security;
alter table public.scan_requests enable row level security;
alter table public.scan_results enable row level security;

create index if not exists editorial_orders_status_idx on public.editorial_orders(status, created_at);
create index if not exists scan_requests_story_idx on public.scan_requests(story_id, created_at);
create index if not exists scan_results_request_idx on public.scan_results(request_id, created_at);
