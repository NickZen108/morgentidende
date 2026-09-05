
-- All new objects are private service-role APIs.
alter table public.v3_settings add column if not exists daily_budget_dkk numeric not null default 10 check(daily_budget_dkk between 0 and 10);
alter table public.v3_settings add column if not exists spending_enabled boolean not null default true;
create table public.v3_costs(
 id uuid primary key, order_id uuid references public.v3_orders(id), workflow_id text not null,
 stage text not null, model text not null, reserved_dkk numeric not null check(reserved_dkk>0),
 charged_dkk numeric, estimated_usd numeric, usage jsonb, status text not null default 'reserved',
 created_at timestamptz not null default now(), settled_at timestamptz,
 check(status in ('reserved','settled','uncertain')), check(charged_dkk is null or charged_dkk>=0)
);
create index on public.v3_costs(settled_at);
create index on public.v3_costs(order_id);
alter table public.v3_costs enable row level security;
revoke all on public.v3_costs from public,anon,authenticated;
grant all on public.v3_costs to service_role;
create function public.v3_reserve_cost(p_id uuid,p_order uuid,p_workflow text,p_stage text,p_model text,p_max_dkk numeric)
returns boolean language plpgsql set search_path='' as $$
declare cap numeric; active boolean; used numeric;
begin
 perform pg_advisory_xact_lock(73103,20);
 select daily_budget_dkk,spending_enabled into strict cap,active from public.v3_settings where id=true;
 if not active or p_max_dkk<=0 or p_max_dkk>cap then return false; end if;
 if exists(select 1 from public.v3_costs where id=p_id) then raise exception 'reservation_already_exists'; end if;
 select coalesce(sum(case when status='reserved' then reserved_dkk else charged_dkk end),0) into used
 from public.v3_costs where status='reserved' or (settled_at at time zone 'Europe/Copenhagen')::date=(now() at time zone 'Europe/Copenhagen')::date;
 if used+p_max_dkk>cap then return false; end if;
 insert into public.v3_costs(id,order_id,workflow_id,stage,model,reserved_dkk) values(p_id,p_order,p_workflow,p_stage,p_model,p_max_dkk);
 return true;
end $$;
create function public.v3_settle_cost(p_id uuid,p_dkk numeric,p_usd numeric,p_usage jsonb,p_uncertain boolean default false)
returns void language plpgsql set search_path='' as $$
declare row public.v3_costs;
begin
 perform pg_advisory_xact_lock(73103,20);
 select * into strict row from public.v3_costs where id=p_id for update;
 if row.status<>'reserved' then return; end if;
 if p_dkk<0 or p_dkk is null then raise exception 'invalid_cost'; end if;
 if p_dkk>row.reserved_dkk then update public.v3_settings set spending_enabled=false where id=true; end if;
 update public.v3_costs set charged_dkk=case when p_uncertain then greatest(p_dkk,reserved_dkk) else p_dkk end,
 estimated_usd=p_usd,usage=p_usage,status=case when p_uncertain then 'uncertain' else 'settled' end,settled_at=now() where id=p_id;
end $$;
create function public.v3_budget_state() returns jsonb language sql stable set search_path='' as $$
select jsonb_build_object('limit_dkk',s.daily_budget_dkk,'spending_enabled',s.spending_enabled,'day',(now() at time zone 'Europe/Copenhagen')::date,
 'committed_dkk',coalesce((select sum(case when c.status='reserved' then c.reserved_dkk else c.charged_dkk end) from public.v3_costs c where c.status='reserved' or (c.settled_at at time zone 'Europe/Copenhagen')::date=(now() at time zone 'Europe/Copenhagen')::date),0))
 from public.v3_settings s where id=true;
$$;
create view public.v3_article_costs with (security_invoker=true) as
 select order_id,sum(charged_dkk) as budget_dkk,sum(estimated_usd) as estimated_usd,count(*) as calls,
 count(*) filter(where status='uncertain') as uncertain_calls,jsonb_agg(jsonb_build_object('stage',stage,'model',model,'usage',usage,'status',status)) as details
 from public.v3_costs group by order_id;
revoke all on public.v3_article_costs from public,anon,authenticated;
grant select on public.v3_article_costs to service_role;
create table public.v3_chat_receipts(
 id uuid primary key, payload_hash text not null, workflow_id text not null,
 status text not null default 'accepted' check(status in ('accepted','dispatched')),
 created_at timestamptz not null default now(),dispatched_at timestamptz
);
alter table public.v3_chat_receipts enable row level security;
revoke all on public.v3_chat_receipts from public,anon,authenticated;
grant all on public.v3_chat_receipts to service_role;
create function public.v3_chat_receipt(p_id uuid,p_hash text,p_workflow text) returns boolean language plpgsql set search_path='' as $$
declare row public.v3_chat_receipts;
begin
 insert into public.v3_chat_receipts(id,payload_hash,workflow_id) values(p_id,p_hash,p_workflow) on conflict(id) do nothing;
 select * into strict row from public.v3_chat_receipts where id=p_id for update;
 if row.payload_hash<>p_hash or row.workflow_id<>p_workflow then raise exception 'command_id_reused'; end if;
 if row.status='dispatched' then return false; end if;
 if row.created_at<now()-interval '1 hour' then raise exception 'dispatch_requires_recovery'; end if;
 return true;
end $$;
-- A database guard protects every publishing path, including future callers.
create function public.v3_guard_review() returns trigger language plpgsql set search_path='' as $$
declare review jsonb;
begin
 select a.review into review from public.v3_attempts a where a.order_id=new.order_id and a.stage='approved' order by a.attempt desc limit 1;
 if review->>'serious_error' is distinct from 'false' then raise exception 'serious_review_error'; end if;
 return new;
end $$;
create trigger v3_article_review_guard before insert on public.v3_articles for each row execute function public.v3_guard_review();
revoke all on function public.v3_reserve_cost(uuid,uuid,text,text,text,numeric),public.v3_settle_cost(uuid,numeric,numeric,jsonb,boolean),public.v3_budget_state(),public.v3_chat_receipt(uuid,text,text),public.v3_guard_review() from public,anon,authenticated;
grant execute on function public.v3_reserve_cost(uuid,uuid,text,text,text,numeric),public.v3_settle_cost(uuid,numeric,numeric,jsonb,boolean),public.v3_budget_state(),public.v3_chat_receipt(uuid,text,text),public.v3_guard_review() to service_role;
-- Existing spend cannot be reconstructed from the old per-request console logs.
-- Close the installation day conservatively; tomorrow starts with the full 10 DKK.
insert into public.v3_costs(id,workflow_id,stage,model,reserved_dkk,charged_dkk,status,settled_at,usage)
values(gen_random_uuid(),'budget-installation','historical-spend-unknown','none',10,10,'uncertain',now(),'{"reason":"pre-installation usage unavailable; conservative day closure"}');

do $$
declare definition text;
begin
 select pg_get_functiondef('public.v3_publish(uuid,integer,text)'::regprocedure) into definition;
 if position('serious_error' in definition)=0 then
  definition:=replace(definition,'if a.stage <> ''approved'' or','if a.stage <> ''approved'' or a.review->>''serious_error'' is distinct from ''false'' or');
  if position('serious_error' in definition)=0 then raise exception 'publish_definition_changed'; end if;
  execute definition;
 end if;
end $$;
