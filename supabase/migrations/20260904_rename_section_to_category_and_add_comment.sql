alter table public.stories rename column section to category;
alter table public.articles rename column section to category;
alter table public.editorial_orders rename column requested_section to requested_category;

alter table public.stories drop constraint if exists stories_category_check;
alter table public.articles drop constraint if exists articles_category_check;
alter table public.editorial_orders drop constraint if exists editorial_orders_requested_category_check;

alter table public.stories add constraint stories_category_check check (category is null or category in ('indland','udland','penge','kultur','viden','liv','kommentar'));
alter table public.articles add constraint articles_category_check check (category is null or category in ('indland','udland','penge','kultur','viden','liv','kommentar'));
alter table public.editorial_orders add constraint editorial_orders_requested_category_check check (requested_category is null or requested_category in ('indland','udland','penge','kultur','viden','liv','kommentar'));
