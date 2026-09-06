begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
do $test$
declare o uuid; normal_o uuid; m uuid; f text; a uuid; command uuid:=gen_random_uuid(); payload jsonb;
begin
 f:='security-test-'||gen_random_uuid();
 insert into public.v3_media_families(id) values(f);
 insert into public.v3_media(family_id,content_hash,original_url,url,credit,alt,license_documentation,rights_verified,vision_verified)
 values(f,md5(f),'https://example.org/'||f,'https://example.org/'||f||'.jpg','Fixture','Fixture','{}',true,false) returning id into m;
 perform public.v3_register_identity(m,md5(f)||md5(f||'sha'),array[(('x'||substr(md5(f),1,16))::bit(64))::text]);
 insert into public.v3_orders(dedupe_key,original_order) values('chatops:direct-v2:'||command,'{"kind":"direct_article_v2"}') returning id into o;
 payload:=jsonb_build_object('headline','Security fixture title','deck','Security fixture deck','category','indland','paragraphs',jsonb_build_array('First','Second'),'sources','[]'::jsonb,'blocks','[]'::jsonb);
 begin
  perform public.v3_publish_direct(o,m,'news-4',payload);
  raise exception 'missing_receipt_was_accepted';
 exception when others then if sqlerrm<>'direct_chat_receipt_required' then raise; end if; end;
 perform public.v3_chat_receipt(command,repeat('a',64),'chatops-publish-'||command);
 a:=public.v3_publish_direct(o,m,'news-4',payload);
 if not exists(select 1 from public.v3_articles where id=a) then raise exception 'valid_receipt_failed'; end if;
 if public.v3_publish_direct(o,m,'news-4',payload)<>a then raise exception 'replay_failed'; end if;
 insert into public.v3_orders(dedupe_key,original_order) values(f||'-normal','{"instruction":"Normal automated order"}') returning id into normal_o;
 update public.v3_media_usage set used_at=now()-interval '11 days' where article_id=a;
 begin
  perform public.v3_publish_direct(normal_o,m,'news-4',payload);
  raise exception 'normal_without_review_was_published';
 exception when others then if sqlerrm<>'direct_order_required' then raise; end if; end;
end $test$;
rollback;