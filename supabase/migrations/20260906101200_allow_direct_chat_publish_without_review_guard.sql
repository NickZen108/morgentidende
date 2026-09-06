create or replace function public.v3_guard_review()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
 review jsonb;
 direct_kind text;
begin
 select o.original_order->>'kind' into direct_kind
 from public.v3_orders o
 where o.id=new.order_id;

 if direct_kind='direct_article_v2' then
  return new;
 end if;

 select a.review into review
 from public.v3_attempts a
 where a.order_id=new.order_id and a.stage='approved'
 order by a.attempt desc
 limit 1;

 if review->>'serious_error' is distinct from 'false' then
  raise exception 'serious_review_error';
 end if;
 if review->>'evidence_status' is distinct from 'verified'
 or review->>'verification_version' is distinct from '1'
 or jsonb_typeof(review->'claim_checks') is distinct from 'array' then
  raise exception 'claim_evidence_unresolved';
 end if;
 if jsonb_array_length(review->'claim_checks')=0 or exists(
  select 1 from jsonb_array_elements(review->'claim_checks') c
  where c->>'status' is distinct from 'supported'
     or c->>'source_verified' is distinct from 'true'
 ) then
  raise exception 'claim_evidence_unresolved';
 end if;
 return new;
end
$function$;
