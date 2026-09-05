begin;
do $$
declare a uuid;b uuid;o uuid; rejected boolean:=false;
begin
 insert into public.v3_media_families(id) values('identity-test-a'),('identity-test-b');
 insert into public.v3_media(family_id,content_hash,original_url,url,credit,alt,license_documentation,rights_verified,vision_verified)
 values('identity-test-a','identity-test-a','https://example.org/a','https://example.org/a.jpg','Test','Test','{}',true,true) returning id into a;
 insert into public.v3_media(family_id,content_hash,original_url,url,credit,alt,license_documentation,rights_verified,vision_verified)
 values('identity-test-b','identity-test-b','https://example.org/b','https://example.org/b.jpg','Test','Test','{}',true,true) returning id into b;
 if public.v3_identity_eligible(a) then raise exception 'unidentified_image_allowed';end if;
 perform public.v3_register_identity(a,repeat('a',64),array[repeat('01',32)]);
 perform public.v3_register_identity(b,repeat('b',64),array['11'||repeat('01',31)]);
 insert into public.v3_orders(dedupe_key,original_order) values('identity-test','{}') returning id into o;
 insert into public.v3_articles(order_id,slug,headline,deck,paragraphs,category,sources,media_id)
 values(o,o::text,'Test headline','Test deck','[]','indland','[]',a);
 insert into public.v3_media_usage(article_id,media_id,family_id) select id,a,'identity-test-a' from public.v3_articles where order_id=o;
 if public.v3_identity_eligible(b) then raise exception 'variant_not_blocked';end if;
 begin
  insert into public.v3_articles(order_id,slug,headline,deck,paragraphs,category,sources,media_id)
  values(o,'other','Test','Test','[]','indland','[]',b);
 exception when others then
  if sqlerrm='image_identity_cooldown_or_unverified' then rejected:=true;else raise;end if;
 end;
 if not rejected then raise exception 'publish_guard_missing';end if;
 update public.v3_media_usage set used_at=now()-interval '10 days' where media_id=a;
 if not public.v3_identity_eligible(b) then raise exception 'ten_day_boundary_failed';end if;
 if has_function_privilege('anon','public.v3_register_identity(uuid,text,text[])','execute') then raise exception 'identity_api_exposed';end if;
end $$;
rollback;
