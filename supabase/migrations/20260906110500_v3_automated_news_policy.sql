-- Keep the automated newsroom separate from direct ChatGPT publishing.
-- The engine may commission only Indland/Udland hard news, with a daily target of 5-6 strong stories.
-- Direct/chat/manual orders do not consume the automated engine's daily allowance.

update public.v3_settings
set enabled = true,
    max_orders_per_day = 6,
    editorial_policy = 'AUTOMATISK AVISMOTOR: Producer kun aktuelle nyheder i kategorierne Udland og Indland, med klar overvægt på Udland. Dagligt mål er 5-6 stærke publicerbare nyheder, normalt ca. 4 Udland, 1 Indland og en sjette fleksibel nyhed efter dagens styrke. Dette er et kvalitetsmål, ikke en tvangskvote: returnér order:null frem for at bestille fyldstof eller en middelmådig historie. Ingen Penge-, Kultur-, Viden-, Liv- eller Kommentar-artikler fra automotoren. Ingen evergreen/features/livsstof. Prioritér væsentlige, aktuelle historier med dansk relevans eller stor international betydning, bred geografisk og kildemæssig spredning, og undgå dubletter/opfølgninger uden nye oplysninger. Fordel som udgangspunkt historierne over dagen i stedet for at bruge dagskvoten hurtigt: normalt ikke en ny automatisk ordre hvis en anden automatisk artikel netop er bestilt eller publiceret inden for cirka to timer, medmindre en klart vigtig breaking-historie gør en ekstra publicering nødvendig. Brug auto_news_today, last_order_at og last_published_at i state til at holde tempo og mix. Artikler publiceret direkte fra ChatGPT er et separat spor og tæller ikke med i automotorens 5-6 nyheder.'
where id = true;

create or replace function public.v3_admit_order(p_key text,p_order jsonb) returns setof public.v3_orders
language plpgsql security invoker set search_path='' as $$
declare
 settings public.v3_settings;
 existing public.v3_orders;
 day_start timestamptz := date_trunc('day',now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen';
begin
 select * into strict settings from public.v3_settings where id=true for update;
 select * into existing from public.v3_orders where dedupe_key=p_key;
 if found then return next existing; return; end if;
 if not settings.enabled then return; end if;

 -- This RPC is the admission gate for scheduled automatic commissioning only.
 -- Fail closed if Chief proposes anything outside the two news sections.
 if coalesce(p_order->>'category','') not in ('indland','udland') then return; end if;

 -- Count only live/successful automatic tick orders. Direct ChatGPT orders and
 -- manual commissioning are separate, and failed/dropped automatic attempts may be replaced.
 if (
   select count(*)
   from public.v3_orders o
   where o.dedupe_key like 'tick-%'
     and o.created_at >= day_start
     and o.status in ('pending','running','published')
 ) >= settings.max_orders_per_day then return; end if;

 insert into public.v3_orders(dedupe_key,original_order) values(p_key,p_order) returning * into existing;
 return next existing;
end $$;

create or replace function public.v3_editorial_state() returns jsonb
language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
 'as_of',now(),
 'window_hours',72,
 'frontpage',coalesce((
   select jsonb_agg(x) from(
     select f.slot,a.id,a.headline,a.category,a.published_at
     from public.v3_frontpage f join public.v3_articles a on a.id=f.article_id
     order by f.slot
   )x
 ),'[]'::jsonb),
 'in_production',coalesce((
   select jsonb_agg(x) from(
     select id,original_order,status,dedupe_key
     from public.v3_orders
     where status in ('pending','running')
     order by created_at limit 30
   )x
 ),'[]'::jsonb),
 'mix_72h',coalesce((
   select jsonb_object_agg(category,n) from(
     select category,count(*) n
     from public.v3_articles
     where published_at>=now()-interval '72 hours'
     group by category
   )x
 ),'{}'::jsonb),
 'recent_headlines',coalesce((
   select jsonb_agg(x) from(
     select headline,category
     from public.v3_articles
     where published_at>=now()-interval '72 hours'
     order by published_at desc limit 80
   )x
 ),'[]'::jsonb),
 'breaking',coalesce((
   select jsonb_agg(x) from(
     select id,payload
     from public.v3_signals
     where processed_at is null and created_at>=now()-interval '2 hours'
     order by created_at desc limit 12
   )x
 ),'[]'::jsonb),
 'auto_news_today',jsonb_build_object(
   'target_min',5,
   'target_max',(select s.max_orders_per_day from public.v3_settings s where s.id=true),
   'active_or_published_orders',(
     select count(*) from public.v3_orders o
     where o.dedupe_key like 'tick-%'
       and o.created_at >= date_trunc('day',now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen'
       and o.status in ('pending','running','published')
   ),
   'published',(
     select count(*) from public.v3_articles a
     join public.v3_orders o on o.id=a.order_id
     where o.dedupe_key like 'tick-%'
       and a.published_at >= date_trunc('day',now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen'
   ),
   'udland',(
     select count(*) from public.v3_articles a
     join public.v3_orders o on o.id=a.order_id
     where o.dedupe_key like 'tick-%'
       and a.category='udland'
       and a.published_at >= date_trunc('day',now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen'
   ),
   'indland',(
     select count(*) from public.v3_articles a
     join public.v3_orders o on o.id=a.order_id
     where o.dedupe_key like 'tick-%'
       and a.category='indland'
       and a.published_at >= date_trunc('day',now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen'
   ),
   'last_order_at',(
     select max(o.created_at) from public.v3_orders o
     where o.dedupe_key like 'tick-%'
       and o.created_at >= date_trunc('day',now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen'
   ),
   'last_published_at',(
     select max(a.published_at) from public.v3_articles a
     join public.v3_orders o on o.id=a.order_id
     where o.dedupe_key like 'tick-%'
       and a.published_at >= date_trunc('day',now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen'
   )
 ),
 'settings',(select to_jsonb(s) from public.v3_settings s)
); $$;

revoke all on function public.v3_admit_order(text,jsonb) from public,anon,authenticated;
revoke all on function public.v3_editorial_state() from public,anon,authenticated;
grant execute on function public.v3_admit_order(text,jsonb),public.v3_editorial_state() to service_role;
