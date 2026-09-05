alter table public.v3_orders add column if not exists error_code text;
create table public.v3_chat_orders (
 command_id uuid not null references public.v3_chat_receipts(id),
 order_id uuid not null references public.v3_orders(id),
 primary key(command_id,order_id)
);
create index on public.v3_chat_orders(order_id);
alter table public.v3_chat_orders enable row level security;
revoke all on public.v3_chat_orders from public,anon,authenticated;
grant all on public.v3_chat_orders to service_role;
