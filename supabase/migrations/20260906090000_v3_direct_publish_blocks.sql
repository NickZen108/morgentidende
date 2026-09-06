alter table public.v3_media add column if not exists variants jsonb not null default '{}'::jsonb;
alter table public.v3_articles add column if not exists blocks jsonb not null default '[]'::jsonb;

create or replace function public.v3_publish_direct(p_order uuid,p_media uuid,p_slot text,p_article jsonb) returns uuid
language plpgsql security invoker set search_path='' as $$
declare
 article uuid;
 stamp timestamptz := clock_timestamp();
 slots text[];
 old_articles uuid[] := '{}';
 start_idx integer;
 i integer;
 old_article uuid;
begin
 if p_slot = any(array['lead','top-1','top-2','top-3','news-1','news-2','news-3','news-4']) then
  slots := array['lead','top-1','top-2','top-3','news-1','news-2','news-3','news-4'];
 elsif p_slot = any(array['viden-1','viden-2']) then
  slots := array['viden-1','viden-2'];
 elsif p_slot = any(array['liv-1','liv-2']) then
  slots := array['liv-1','liv-2'];
 else raise exception 'invalid_frontpage_slot'; end if;
 start_idx := array_position(slots,p_slot);
 perform 1 from public.v3_orders where id=p_order for update;
 select id into article from public.v3_articles where order_id=p_order;
 if found then return article; end if;
 if not exists(select 1 from public.v3_media where id=p_media and rights_verified=true) then raise exception 'direct_media_unverified'; end if;
 if not public.v3_identity_eligible(p_media) then raise exception 'direct_media_identity_unverified'; end if;
 if p_article->>'headline' is null or p_article->>'deck' is null or jsonb_array_length(p_article->'paragraphs')=0 then raise exception 'direct_article_incomplete'; end if;
 insert into public.v3_articles(order_id,slug,headline,deck,paragraphs,blocks,category,sources,media_id,published_at)
 values(p_order,p_order::text,p_article->>'headline',p_article->>'deck',p_article->'paragraphs',coalesce(p_article->'blocks','[]'::jsonb),p_article->>'category',coalesce(p_article->'sources','[]'::jsonb),p_media,stamp)
 returning id into article;
 insert into public.v3_media_usage(article_id,media_id,family_id,used_at)
 select article,m.id,m.family_id,stamp from public.v3_media m where m.id=p_media;
 update public.v3_media_families f set last_used_at=stamp from public.v3_media m where m.id=p_media and f.id=m.family_id;
 update public.v3_media set usage_count_30d=(select count(*) from public.v3_media_usage where media_id=p_media and used_at>=stamp-interval '30 days') where id=p_media;
 for i in start_idx..array_length(slots,1) loop
  select article_id into old_article from public.v3_frontpage where slot=slots[i];
  old_articles := array_append(old_articles,old_article);
 end loop;
 delete from public.v3_frontpage where slot = any(slots[start_idx:array_length(slots,1)]);
 insert into public.v3_frontpage(slot,article_id,placed_at) values(p_slot,article,stamp);
 for i in 1..coalesce(array_length(old_articles,1),0) loop
  exit when start_idx+i > array_length(slots,1);
  if old_articles[i] is not null and old_articles[i]<>article then
   insert into public.v3_frontpage(slot,article_id,placed_at) values(slots[start_idx+i],old_articles[i],stamp);
  end if;
 end loop;
 update public.v3_orders set status='published',error_code=null,updated_at=stamp where id=p_order;
 return article;
end $$;
revoke all on function public.v3_publish_direct(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.v3_publish_direct(uuid,uuid,text,jsonb) to service_role;
