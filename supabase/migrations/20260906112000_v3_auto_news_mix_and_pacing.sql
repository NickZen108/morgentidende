-- Automatic newsroom only: keep 5-6 strong daily news stories, mostly Udland.
-- Direct ChatGPT/manual publishing remains a separate path and does not count here.

create or replace function public.v3_admit_order(p_key text,p_order jsonb) returns setof public.v3_orders
language plpgsql security invoker set search_path='' as $$
declare
 settings public.v3_settings;
 existing public.v3_orders;
 day_start timestamptz := date_trunc('day',now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen';
 auto_count integer;
 udland_count integer;
 indland_count integer;
 last_order timestamptz;
 category text := coalesce(p_order->>'category','');
begin
 select * into strict settings from public.v3_settings where id=true for update;
 select * into existing from public.v3_orders where dedupe_key=p_key;
 if found then return next existing; return; end if;
 if not settings.enabled then return; end if;
 if category not in ('indland','udland') then return; end if;

 select count(*),
        count(*) filter (where original_order->>'category'='udland'),
        count(*) filter (where original_order->>'category'='indland'),
        max(created_at)
 into auto_count,udland_count,indland_count,last_order
 from public.v3_orders
 where dedupe_key like 'tick-%'
   and created_at>=day_start
   and status in ('pending','running','published');

 if auto_count>=settings.max_orders_per_day then return; end if;

 -- Spread automatic commissions across the day. With an hourly Chief cron,
 -- this normally produces at most one new commission roughly every two hours.
 if last_order is not null and last_order>now()-interval '90 minutes' then return; end if;

 -- Keep a clear international majority: normally four Udland before a second
 -- Indland slot is available, and never more than two automatic Indland stories/day.
 if category='indland' then
   if indland_count>=2 then return; end if;
   if indland_count>=1 and udland_count<4 then return; end if;
 end if;

 insert into public.v3_orders(dedupe_key,original_order) values(p_key,p_order) returning * into existing;
 return next existing;
end $$;

revoke all on function public.v3_admit_order(text,jsonb) from public,anon,authenticated;
grant execute on function public.v3_admit_order(text,jsonb) to service_role;
