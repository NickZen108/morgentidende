-- Applied through Supabase apply_migration as v3_order_admission.
create function public.v3_admit_order(p_key text,p_order jsonb) returns setof public.v3_orders
language plpgsql security invoker set search_path='' as $$
declare settings public.v3_settings; existing public.v3_orders;
begin
 select * into strict settings from public.v3_settings where id=true for update;
 select * into existing from public.v3_orders where dedupe_key=p_key;
 if found then return next existing; return; end if;
 if not settings.enabled then return; end if;
 if (select count(*) from public.v3_orders where created_at>=date_trunc('day',now() at time zone 'Europe/Copenhagen') at time zone 'Europe/Copenhagen') >= settings.max_orders_per_day then return; end if;
 insert into public.v3_orders(dedupe_key,original_order) values(p_key,p_order) returning * into existing;
 return next existing;
end $$;
revoke all on function public.v3_admit_order(text,jsonb) from public,anon,authenticated;
grant execute on function public.v3_admit_order(text,jsonb) to service_role;

