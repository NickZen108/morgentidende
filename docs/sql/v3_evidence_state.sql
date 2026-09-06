create or replace function public.v3_editorial_state() returns jsonb
language sql stable set search_path='' as $$
select jsonb_build_object(
 'as_of',now(),'window_hours',72,
 'frontpage',coalesce((select jsonb_agg(x) from(select f.slot,a.id,a.headline,a.category,a.published_at from public.v3_frontpage f join public.v3_articles a on a.id=f.article_id order by f.slot)x),'[]'::jsonb),
 'in_production',coalesce((select jsonb_agg(x) from(
  select id,status,error_code,jsonb_strip_nulls(jsonb_build_object(
   'instruction',left(original_order->>'instruction',1000),
   'category',coalesce(original_order->>'category',original_order->'article'->>'category'),
   'mode',original_order->>'mode','headline',original_order->'article'->>'headline'
  )) as original_order from public.v3_orders where status in ('pending','running','paused') order by (status='paused'),created_at limit 30
 )x),'[]'::jsonb),
 'mix_72h',coalesce((select jsonb_object_agg(category,n) from(select category,count(*) n from public.v3_articles where published_at>=now()-interval '72 hours' group by category)x),'{}'::jsonb),
 'recent_headlines',coalesce((select jsonb_agg(x) from(select headline,category from public.v3_articles where published_at>=now()-interval '72 hours' order by published_at desc limit 80)x),'[]'::jsonb),
 'breaking',coalesce((select jsonb_agg(x) from(select id,payload from public.v3_signals where processed_at is null and created_at>=now()-interval '2 hours' order by created_at desc limit 12)x),'[]'::jsonb),
 'settings',(select to_jsonb(s) from public.v3_settings s)
); $$;
