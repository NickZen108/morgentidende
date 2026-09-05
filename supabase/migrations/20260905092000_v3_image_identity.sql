create table public.v3_image_identity (
 media_id uuid primary key references public.v3_media(id),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 fingerprints text[] not null check(cardinality(fingerprints) between 1 and 7),
 checked_at timestamptz not null default now()
);
alter table public.v3_image_identity enable row level security;
revoke all on public.v3_image_identity from anon,authenticated;
grant all on public.v3_image_identity to service_role;
create function public.v3_images_match(a text[],b text[]) returns boolean
language sql immutable strict set search_path='' as $$
 select exists(select 1 from unnest(a) x cross join unnest(b) y
 where bit_count(x::bit(64) # y::bit(64))<=8);
$$;
create function public.v3_register_identity(p_media uuid,p_hash text,p_fingerprints text[]) returns text
language plpgsql security invoker set search_path='' as $$
declare family text;
begin
 if cardinality(p_fingerprints) not between 1 and 7 or exists(select 1 from unnest(p_fingerprints) f where f !~ '^[01]{64}$')
 then raise exception 'identity_invalid'; end if;
 select family_id into strict family from public.v3_media where id=p_media;
 insert into public.v3_image_identity(media_id,sha256,fingerprints) values(p_media,p_hash,p_fingerprints)
 on conflict(media_id) do update set sha256=excluded.sha256,fingerprints=excluded.fingerprints,checked_at=now();
 return family;
end $$;
create function public.v3_identity_eligible(p_media uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.v3_image_identity candidate where candidate.media_id=p_media
 and not exists(select 1 from public.v3_media_usage u join public.v3_image_identity prior on prior.media_id=u.media_id
 where u.used_at>now()-interval '10 days'
 and (prior.sha256=candidate.sha256 or public.v3_images_match(prior.fingerprints,candidate.fingerprints))));
$$;
create function public.v3_guard_image_identity() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 -- Serialize publication across families so concurrent variants cannot both pass.
 perform pg_advisory_xact_lock(73103,10);
 if not public.v3_identity_eligible(new.media_id) then raise exception 'image_identity_cooldown_or_unverified'; end if;
 return new;
end $$;
create trigger v3_article_image_identity before insert on public.v3_articles
for each row execute function public.v3_guard_image_identity();
revoke all on function public.v3_images_match(text[],text[]), public.v3_register_identity(uuid,text,text[]), public.v3_identity_eligible(uuid), public.v3_guard_image_identity() from public,anon,authenticated;
grant execute on function public.v3_images_match(text[],text[]), public.v3_register_identity(uuid,text,text[]), public.v3_identity_eligible(uuid), public.v3_guard_image_identity() to service_role;
