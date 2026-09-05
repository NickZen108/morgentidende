begin;
do $$
declare o uuid; o2 uuid; m uuid; a uuid; b uuid; rejected boolean := false;
begin
 insert into public.v3_orders(dedupe_key,original_order) values('test-'||gen_random_uuid(),'{}') returning id into o;
 insert into public.v3_orders(dedupe_key,original_order) values('test-'||gen_random_uuid(),'{}') returning id into o2;
 insert into public.v3_media_families(id) values('test-family');
 insert into public.v3_media(family_id,content_hash,original_url,url,credit,alt,license_documentation,rights_verified,vision_verified)
 values('test-family','test-hash','https://example.org/test','https://example.org/test.jpg','Test','Test','{"license":"CC0","license_url":"https://example.org/license","evidence":"test","verified_at":"2026-09-05"}',true,true) returning id into m;
 insert into public.v3_attempts(order_id,attempt,stage,dossier,draft,review,media_id)
 select oid,1,'approved','{"sources":[]}'::jsonb,'{"headline":"Test headline","deck":"Test deck","paragraphs":["one","two"],"category":"indland"}'::jsonb,'{"matches_order":true,"headline_correct":true,"serious_error":false}'::jsonb,m from unnest(array[o,o2]) oid;
 perform public.v3_register_identity(m,repeat('a',64),array[repeat('01',32)]);
 update public.v3_attempts set review=review||'{"serious_error":true}'::jsonb where order_id=o;
 begin
  perform public.v3_publish(o,1,'lead');
  raise exception 'serious_error_published';
 exception when others then
  if sqlerrm not in ('attempt_not_approved','serious_review_error','review_not_approved') then raise; end if;
 end;
 update public.v3_attempts set review=review||'{"serious_error":false}'::jsonb where order_id=o;
 a:=public.v3_publish(o,1,'lead'); b:=public.v3_publish(o,1,'lead');
 if a<>b or (select count(*) from public.v3_media_usage where article_id=a)<>1 then raise exception 'idempotency_failed'; end if;
 begin perform public.v3_publish(o2,1,'top-1'); exception when others then if sqlerrm='image_family_cooldown' then rejected:=true;else raise;end if;end;
 if not rejected then raise exception 'cooldown_failed';end if;
 if exists(select 1 from public.v3_articles where order_id=o2) then raise exception 'transaction_not_atomic';end if;
 update public.v3_media_families set last_used_at=now()-interval '10 days 1 second' where id='test-family';
 update public.v3_media_usage set used_at=now()-interval '10 days 1 second' where article_id=a;
 perform public.v3_publish(o2,1,'top-1');
 if (select usage_count_30d from public.v3_media where id=m)<>2 then raise exception 'usage_count_failed';end if;
 if has_function_privilege('anon','public.v3_publish(uuid,integer,text)','execute') then raise exception 'publish_exposed';end if;
end $$;
rollback;
