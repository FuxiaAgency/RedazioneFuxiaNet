-- =====================================================================
--  Redazione · Fuxia Magazine e Rete NeTVision
--  Schema del database per Supabase.
--  Come usarlo: Supabase → SQL Editor → New query → incolla tutto → Run.
--  Si può rieseguire: non cancella i dati esistenti.
-- =====================================================================

-- ---------- Persone e ruoli ----------
-- Ruoli: in_attesa (appena iscritto, non vede nulla), lettore, redattore, direttore.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  name        text not null default '',
  role        text not null default 'in_attesa'
              check (role in ('in_attesa','lettore','redattore','direttore')),
  created_at  timestamptz not null default now()
);

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;
create or replace function public.is_reader() returns boolean
language sql stable as $$ select coalesce(public.my_role() in ('lettore','redattore','direttore'), false) $$;
create or replace function public.is_member() returns boolean
language sql stable as $$ select coalesce(public.my_role() in ('redattore','direttore'), false) $$;
create or replace function public.is_director() returns boolean
language sql stable as $$ select coalesce(public.my_role() = 'direttore', false) $$;

-- Alla registrazione nasce il profilo. Il primo iscritto diventa direttore,
-- tutti gli altri restano "in attesa" finché un direttore non li approva.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id, new.email,
    coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)),
    case when exists (select 1 from public.profiles) then 'in_attesa' else 'direttore' end
  )
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Solo un direttore cambia i ruoli, e non si può restare senza direttori.
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    if not public.is_director() then
      raise exception 'Solo un direttore può cambiare i ruoli';
    end if;
    if old.role = 'direttore' and new.role <> 'direttore'
       and (select count(*) from public.profiles where role = 'direttore') <= 1 then
      raise exception 'Serve almeno un direttore: nominane un altro prima';
    end if;
  end if;
  new.id := old.id;
  new.email := old.email;
  return new;
end $$;
drop trigger if exists guard_profile on public.profiles;
create trigger guard_profile before update on public.profiles
  for each row execute function public.guard_profile();

-- ---------- Foto ----------
create table if not exists public.photos (
  id          uuid primary key default gen_random_uuid(),
  path        text not null,              -- percorso nel contenitore "foto"
  caption     text not null default '',
  credit      text not null default '',
  name        text not null default '',
  by_id       uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------- Articoli ----------
create table if not exists public.articles (
  id           uuid primary key default gen_random_uuid(),
  testata      text not null default 'fuxia' check (testata in ('fuxia','rnv')),
  title        text not null default '',
  kicker       text not null default '',
  summary      text not null default '',
  section      text not null default '',
  firma        text not null default '',
  body         text not null default '',
  cover_id     uuid,
  gallery      uuid[] not null default '{}',
  status       text not null default 'bozza'
               check (status in ('bozza','revisione','correggere','pronto','pubblicato')),
  author_id    uuid references public.profiles(id) on delete set null,
  assignee_id  uuid references public.profiles(id) on delete set null,
  deadline     timestamptz,
  history      jsonb not null default '[]',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  locked_by    uuid references public.profiles(id) on delete set null,
  locked_until timestamptz
);
create index if not exists articles_updated_idx on public.articles (updated_at desc);

-- Solo il direttore pubblica, ritira o modifica un pezzo già pubblicato.
create or replace function public.guard_article() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_director() then return new; end if;
  if tg_op = 'INSERT' then
    if new.status = 'pubblicato' then raise exception 'Solo il direttore può pubblicare'; end if;
    return new;
  end if;
  if new.status is distinct from old.status and (new.status = 'pubblicato' or old.status = 'pubblicato') then
    raise exception 'Solo il direttore può pubblicare o ritirare un articolo';
  end if;
  if old.status = 'pubblicato' and
     (new.title, new.kicker, new.summary, new.section, new.firma, new.body, new.cover_id, new.gallery, new.testata)
     is distinct from
     (old.title, old.kicker, old.summary, old.section, old.firma, old.body, old.cover_id, old.gallery, old.testata) then
    raise exception 'Un articolo pubblicato può modificarlo solo il direttore';
  end if;
  return new;
end $$;
drop trigger if exists guard_article on public.articles;
create trigger guard_article before insert or update on public.articles
  for each row execute function public.guard_article();

-- Blocco "sto modificando io": uno alla volta per articolo, scade da solo.
create or replace function public.acquire_lock(aid uuid, secs int default 45) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member() then return false; end if;
  update public.articles
     set locked_by = auth.uid(), locked_until = now() + make_interval(secs => secs)
   where id = aid
     and (locked_by is null or locked_until < now() or locked_by = auth.uid());
  return found;
end $$;
create or replace function public.release_lock(aid uuid) returns void
language sql security definer set search_path = public as $$
  update public.articles set locked_by = null, locked_until = null
   where id = aid and locked_by = auth.uid();
$$;

-- ---------- Note, suggerimenti e correzioni ----------
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  article_id  uuid not null references public.articles(id) on delete cascade,
  kind        text not null default 'nota' check (kind in ('nota','suggerimento','correzione')),
  text        text not null,
  quote       text not null default '',
  by_id       uuid references public.profiles(id) on delete set null,
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists notes_article_idx on public.notes (article_id, created_at);

-- ---------- Menabò (uno per testata) ----------
create table if not exists public.menabo (
  testata     text primary key check (testata in ('fuxia','rnv')),
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

-- ---------- Regole di accesso ----------
alter table public.profiles enable row level security;
alter table public.articles enable row level security;
alter table public.notes    enable row level security;
alter table public.photos   enable row level security;
alter table public.menabo   enable row level security;

drop policy if exists profiles_read   on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_read   on public.profiles for select to authenticated using (id = auth.uid() or public.is_reader());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid() or public.is_director());

drop policy if exists articles_read   on public.articles;
drop policy if exists articles_insert on public.articles;
drop policy if exists articles_update on public.articles;
drop policy if exists articles_delete on public.articles;
create policy articles_read   on public.articles for select to authenticated using (public.is_reader());
create policy articles_insert on public.articles for insert to authenticated with check (public.is_member() and author_id = auth.uid());
create policy articles_update on public.articles for update to authenticated using (public.is_member());
create policy articles_delete on public.articles for delete to authenticated
  using (public.is_director() or (author_id = auth.uid() and status <> 'pubblicato'));

drop policy if exists notes_read   on public.notes;
drop policy if exists notes_insert on public.notes;
drop policy if exists notes_update on public.notes;
drop policy if exists notes_delete on public.notes;
create policy notes_read   on public.notes for select to authenticated using (public.is_reader());
create policy notes_insert on public.notes for insert to authenticated with check (public.is_member() and by_id = auth.uid());
create policy notes_update on public.notes for update to authenticated using (public.is_member());
create policy notes_delete on public.notes for delete to authenticated using (public.is_director() or by_id = auth.uid());

drop policy if exists photos_read   on public.photos;
drop policy if exists photos_insert on public.photos;
drop policy if exists photos_update on public.photos;
drop policy if exists photos_delete on public.photos;
create policy photos_read   on public.photos for select to authenticated using (public.is_reader());
create policy photos_insert on public.photos for insert to authenticated with check (public.is_member() and by_id = auth.uid());
create policy photos_update on public.photos for update to authenticated using (public.is_member());
create policy photos_delete on public.photos for delete to authenticated using (public.is_director() or by_id = auth.uid());

drop policy if exists menabo_read  on public.menabo;
drop policy if exists menabo_write on public.menabo;
create policy menabo_read  on public.menabo for select to authenticated using (public.is_reader());
create policy menabo_write on public.menabo for all    to authenticated using (public.is_director()) with check (public.is_director());

-- ---------- Contenitore delle foto ----------
insert into storage.buckets (id, name, public) values ('foto', 'foto', true)
  on conflict (id) do nothing;
drop policy if exists foto_read   on storage.objects;
drop policy if exists foto_insert on storage.objects;
drop policy if exists foto_delete on storage.objects;
create policy foto_read   on storage.objects for select to authenticated
  using (bucket_id = 'foto');
create policy foto_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'foto' and public.is_member());
create policy foto_delete on storage.objects for delete to authenticated
  using (bucket_id = 'foto' and public.is_member());

-- ---------- Aggiornamenti in tempo reale ----------
do $$
declare t text;
begin
  foreach t in array array['profiles','articles','notes','photos','menabo'] loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- Appunti: blocco note condiviso (aggiunto il 20/10/2026) ----------
create table if not exists public.appunti (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'promemoria' check (kind in ('promemoria','notizia','intervista','idea')),
  text        text not null,
  link        text not null default '',
  testata     text check (testata in ('fuxia','rnv')),
  done        boolean not null default false,
  by_id       uuid references public.profiles(id) on delete set null,
  article_id  uuid references public.articles(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.appunti enable row level security;
grant select, insert, update, delete on public.appunti to authenticated;
drop policy if exists appunti_read   on public.appunti;
drop policy if exists appunti_insert on public.appunti;
drop policy if exists appunti_update on public.appunti;
drop policy if exists appunti_delete on public.appunti;
create policy appunti_read   on public.appunti for select to authenticated using (public.is_reader());
create policy appunti_insert on public.appunti for insert to authenticated with check (public.is_member() and by_id = auth.uid());
create policy appunti_update on public.appunti for update to authenticated using (public.is_member());
create policy appunti_delete on public.appunti for delete to authenticated using (public.is_director() or by_id = auth.uid());
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appunti') then
    alter publication supabase_realtime add table public.appunti;
  end if;
end $$;

-- ---------- Rubrica: contatti condivisi (aggiunta il 20/10/2026) ----------
create table if not exists public.contatti (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  role        text not null default '',
  org         text not null default '',
  phone       text not null default '',
  phone2      text not null default '',
  email       text not null default '',
  website     text not null default '',
  instagram   text not null default '',
  facebook    text not null default '',
  x           text not null default '',
  address     text not null default '',
  notes       text not null default '',
  by_id       uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.contatti enable row level security;
grant select, insert, update, delete on public.contatti to authenticated;
drop policy if exists contatti_read   on public.contatti;
drop policy if exists contatti_insert on public.contatti;
drop policy if exists contatti_update on public.contatti;
drop policy if exists contatti_delete on public.contatti;
create policy contatti_read   on public.contatti for select to authenticated using (public.is_reader());
create policy contatti_insert on public.contatti for insert to authenticated with check (public.is_member() and by_id = auth.uid());
create policy contatti_update on public.contatti for update to authenticated using (public.is_member());
create policy contatti_delete on public.contatti for delete to authenticated using (public.is_director() or by_id = auth.uid());
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contatti') then
    alter publication supabase_realtime add table public.contatti;
  end if;
end $$;
