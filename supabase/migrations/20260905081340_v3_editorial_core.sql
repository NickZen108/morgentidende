create table public.v3_orders (
 id uuid primary key default gen_random_uuid(), dedupe_key text unique not null,
 original_order jsonb not null check(jsonb_typeof(original_order)='object'),
 status text not null default 'pending' check(status in ('pending','running','published','dropped','failed')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.v3_attempts (
 order_id uuid references public.v3_orders not null, attempt integer not null check(attempt between 1 and 2),
 stage text not null, research_requests integer not null default 0 check(research_requests between 0 and 3),
 dossier jsonb, draft jsonb, review jsonb, media_id uuid,
 primary key(order_id,attempt)
);
create table public.v3_media_families (
 id text primary key, last_used_at timestamptz
);
create table public.v3_media (
 id uuid primary key default gen_random_uuid(), family_id text not null references public.v3_media_families,
 content_hash text not null unique, original_url text not null unique, url text not null,
 credit text not null, alt text not null, license_documentation jsonb not null,
 rights_verified boolean not null default false, vision_verified boolean not null default false,
 generated boolean not null default false, tags text[] not null default '{}',
 usage_count_30d integer not null default 0, created_at timestamptz not null default now()
);
create table public.v3_articles (
 id uuid primary key default gen_random_uuid(), order_id uuid not null unique references public.v3_orders,
 slug text not null unique, headline text not null, deck text not null, paragraphs jsonb not null,
 category text not null check(category in ('indland','udland','penge','kultur','viden','liv','kommentar')),
 sources jsonb not null, media_id uuid not null references public.v3_media, published_at timestamptz not null default now()
);
create table public.v3_frontpage (
 slot text primary key check(slot in ('lead','top-1','top-2','top-3','news-1','news-2','news-3','news-4','viden-1','viden-2','liv-1','liv-2')),
 article_id uuid not null unique references public.v3_articles, placed_at timestamptz not null default now()
);
create table public.v3_media_usage (
 article_id uuid primary key references public.v3_articles,
 media_id uuid not null references public.v3_media, family_id text not null references public.v3_media_families,
 used_at timestamptz not null default now()
);
create index v3_usage_family_time on public.v3_media_usage(family_id,used_at desc);
create index v3_usage_media_time on public.v3_media_usage(media_id,used_at desc);
create index v3_articles_time on public.v3_articles(published_at desc);
create index v3_articles_media on public.v3_articles(media_id);
create index v3_frontpage_article on public.v3_frontpage(article_id);
create index v3_media_family on public.v3_media(family_id);
create index v3_orders_status_time on public.v3_orders(status,created_at);
create table public.v3_signals (
 id text primary key, payload jsonb not null, created_at timestamptz not null default now(), processed_at timestamptz
);
create table public.v3_settings (
 id boolean primary key default true check(id), enabled boolean not null default false,
 max_orders_per_day integer not null default 20 check(max_orders_per_day between 1 and 100),
 editorial_policy text not null default 'Et bredt dansk nyhedsmix og originale, veldokumenterede Viden- og Liv-artikler. Bestil kun når der er et reelt behov.'
);
insert into public.v3_settings(id) values(true);

create function public.v3_publish(p_order uuid,p_attempt integer,p_slot text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare a public.v3_attempts; m public.v3_media; f public.v3_media_families; article uuid; stamp timestamptz := clock_timestamp();
begin
 perform 1 from public.v3_orders where id=p_order for update;
 select id into article from public.v3_articles where order_id=p_order;
 if found then return article; end if;
 select * into strict a from public.v3_attempts where order_id=p_order and attempt=p_attempt for update;
 if a.stage <> 'approved' or a.review->>'matches_order' is distinct from 'true' or a.review->>'headline_correct' is distinct from 'true' then
  raise exception 'review_not_approved'; end if;
 select * into strict m from public.v3_media where id=a.media_id;
 select * into strict f from public.v3_media_families where id=m.family_id for update;
 if not m.rights_verified or not m.vision_verified or jsonb_typeof(m.license_documentation) <> 'object'
 or not (m.license_documentation ?& array['license','license_url','evidence','verified_at']) then raise exception 'media_unverified'; end if;
 if f.last_used_at > stamp-interval '10 days' or exists(select 1 from public.v3_media_usage where family_id=m.family_id and used_at>stamp-interval '10 days') then raise exception 'image_family_cooldown'; end if;
 if a.draft->>'headline' is null or jsonb_array_length(a.draft->'paragraphs')=0 then raise exception 'draft_incomplete'; end if;
 insert into public.v3_articles(order_id,slug,headline,deck,paragraphs,category,sources,media_id,published_at)
 values(p_order,p_order::text,a.draft->>'headline',a.draft->>'deck',a.draft->'paragraphs',a.draft->>'category',a.dossier->'sources',m.id,stamp) returning id into article;
 insert into public.v3_media_usage(article_id,media_id,family_id,used_at) values(article,m.id,m.family_id,stamp);
 update public.v3_media_families set last_used_at=stamp where id=m.family_id;
 update public.v3_media set usage_count_30d=(select count(*) from public.v3_media_usage where media_id=m.id and used_at>=stamp-interval '30 days') where id=m.id;
 insert into public.v3_frontpage(slot,article_id,placed_at) values(p_slot,article,stamp)
 on conflict(slot) do update set article_id=excluded.article_id,placed_at=excluded.placed_at;
 update public.v3_orders set status='published',updated_at=stamp where id=p_order;
 update public.v3_attempts set stage='published' where order_id=p_order and attempt=p_attempt;
 return article;
end $$;

create function public.v3_editorial_state() returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
 'as_of',now(),'window_hours',72,
 'frontpage',coalesce((select jsonb_agg(x) from(select f.slot,a.id,a.headline,a.category,a.published_at from public.v3_frontpage f join public.v3_articles a on a.id=f.article_id order by f.slot)x),'[]'::jsonb),
 'in_production',coalesce((select jsonb_agg(x) from(select id,original_order,status from public.v3_orders where status in ('pending','running') order by created_at limit 30)x),'[]'::jsonb),
 'mix_72h',coalesce((select jsonb_object_agg(category,n) from(select category,count(*) n from public.v3_articles where published_at>=now()-interval '72 hours' group by category)x),'{}'::jsonb),
 'recent_headlines',coalesce((select jsonb_agg(x) from(select headline,category from public.v3_articles where published_at>=now()-interval '72 hours' order by published_at desc limit 80)x),'[]'::jsonb),
 'breaking',coalesce((select jsonb_agg(x) from(select id,payload from public.v3_signals where processed_at is null and created_at>=now()-interval '2 hours' order by created_at desc limit 12)x),'[]'::jsonb),
 'settings',(select to_jsonb(s) from public.v3_settings s)
); $$;

create function public.v3_refresh_usage() returns void language sql security invoker set search_path='' as $$
update public.v3_media m set usage_count_30d=(select count(*) from public.v3_media_usage u where u.media_id=m.id and u.used_at>=now()-interval '30 days');
$$;

do $$ declare t text; begin
 foreach t in array array['v3_orders','v3_attempts','v3_media_families','v3_media','v3_articles','v3_frontpage','v3_media_usage','v3_signals','v3_settings'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
revoke all on function public.v3_publish(uuid,integer,text) from public,anon,authenticated;
revoke all on function public.v3_editorial_state() from public,anon,authenticated;
revoke all on function public.v3_refresh_usage() from public,anon,authenticated;
grant execute on function public.v3_publish(uuid,integer,text),public.v3_editorial_state(),public.v3_refresh_usage() to service_role;
