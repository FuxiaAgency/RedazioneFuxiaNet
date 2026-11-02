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

-- ---------- Agenda: appuntamenti, telefonate, interviste e scadenze (aggiunta il 21/10/2026) ----------
create table if not exists public.appuntamenti (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null default 'telefonata'
                check (kind in ('telefonata','intervista','riunione','incontro','scadenza','altro')),
  title         text not null default '',
  starts_at     timestamptz not null,
  all_day       boolean not null default false,
  remind_min    int check (remind_min is null or remind_min between 0 and 20160),
  notes         text not null default '',
  contact_id    uuid references public.contatti(id) on delete set null,
  article_id    uuid references public.articles(id) on delete set null,
  assignee_id   uuid references public.profiles(id) on delete set null,
  created_by    uuid references public.profiles(id) on delete set null,
  visibility    text not null default 'tutti' check (visibility in ('tutti','direzione','privato')),
  status        text not null default 'da_fare' check (status in ('da_fare','completato','rinviato','annullato')),
  repeat        text not null default 'no' check (repeat in ('no','giorno','settimana','mese')),
  repeat_until  date,
  done_dates    text[] not null default '{}',
  testata       text check (testata in ('fuxia','rnv')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists appuntamenti_starts_idx on public.appuntamenti (starts_at);

-- Chi può vedere un appuntamento: tutti, solo la direzione, oppure solo chi l'ha creato e chi è assegnato.
create or replace function public.can_see_appuntamento(vis text, creator uuid, assignee uuid) returns boolean
language sql stable as $$
  select public.is_reader() and (
    vis = 'tutti'
    or creator = auth.uid() or assignee = auth.uid()
    or (vis = 'direzione' and public.is_director())
  )
$$;

alter table public.appuntamenti enable row level security;
grant select, insert, update, delete on public.appuntamenti to authenticated;
drop policy if exists appuntamenti_read   on public.appuntamenti;
drop policy if exists appuntamenti_insert on public.appuntamenti;
drop policy if exists appuntamenti_update on public.appuntamenti;
drop policy if exists appuntamenti_delete on public.appuntamenti;
create policy appuntamenti_read   on public.appuntamenti for select to authenticated
  using (public.can_see_appuntamento(visibility, created_by, assignee_id));
create policy appuntamenti_insert on public.appuntamenti for insert to authenticated
  with check (public.is_member() and created_by = auth.uid()
              and (visibility <> 'direzione' or public.is_director()));
create policy appuntamenti_update on public.appuntamenti for update to authenticated
  using (public.is_member() and public.can_see_appuntamento(visibility, created_by, assignee_id))
  with check (public.is_member() and public.can_see_appuntamento(visibility, created_by, assignee_id));
create policy appuntamenti_delete on public.appuntamenti for delete to authenticated
  using (public.is_director() or created_by = auth.uid());

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appuntamenti') then
    alter publication supabase_realtime add table public.appuntamenti;
  end if;
end $$;

-- ---------- 1Channel: terza testata (aggiunta il 23/10/2026)
alter table public.articles     drop constraint if exists articles_testata_check;
alter table public.articles     add  constraint articles_testata_check     check (testata in ('fuxia','rnv','ch1'));
alter table public.appunti      drop constraint if exists appunti_testata_check;
alter table public.appunti      add  constraint appunti_testata_check      check (testata in ('fuxia','rnv','ch1'));
alter table public.appuntamenti drop constraint if exists appuntamenti_testata_check;
alter table public.appuntamenti add  constraint appuntamenti_testata_check check (testata in ('fuxia','rnv','ch1'));
alter table public.menabo       drop constraint if exists menabo_testata_check;
alter table public.menabo       add  constraint menabo_testata_check       check (testata in ('fuxia','rnv','ch1'));

-- ---------- Sicurezza: percorso fisso per le funzioni dei ruoli e niente accesso anonimo alle funzioni interne (24/10/2026)
alter function public.is_reader() set search_path = public;
alter function public.is_member() set search_path = public;
alter function public.is_director() set search_path = public;
alter function public.can_see_appuntamento(text, uuid, uuid) set search_path = public;
revoke execute on function public.my_role() from public, anon;
revoke execute on function public.acquire_lock(uuid, int) from public, anon;
revoke execute on function public.release_lock(uuid) from public, anon;
revoke execute on function public.guard_article() from public, anon, authenticated;
revoke execute on function public.guard_profile() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.my_role() to authenticated;
grant execute on function public.acquire_lock(uuid, int) to authenticated;
grant execute on function public.release_lock(uuid) to authenticated;

-- ---------- Vocali e trascrizioni (aggiunto il 26/10/2026) ----------
-- I file audio stanno nel contenitore privato 'audio' (le interviste non devono essere pubbliche):
-- l'app li apre con link temporanei firmati. La trascrizione la fa la funzione 'trascrivi' (OpenAI).
create table if not exists public.vocali (
  id          uuid primary key default gen_random_uuid(),
  path        text not null,
  name        text not null default '',
  mime        text not null default '',
  size        integer not null default 0,
  duration    real,
  testata     text check (testata in ('fuxia','rnv','ch1')),
  article_id  uuid references public.articles(id) on delete set null,
  contact_id  uuid references public.contatti(id) on delete set null,
  note        text not null default '',
  transcript  text not null default '',
  status      text not null default 'nuovo' check (status in ('nuovo','in_corso','fatto','errore')),
  error       text not null default '',
  by_id       uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists vocali_article_idx on public.vocali(article_id);
alter table public.vocali enable row level security;
grant select, insert, update, delete on public.vocali to authenticated;
drop policy if exists vocali_read   on public.vocali;
drop policy if exists vocali_insert on public.vocali;
drop policy if exists vocali_update on public.vocali;
drop policy if exists vocali_delete on public.vocali;
create policy vocali_read   on public.vocali for select to authenticated using (public.is_reader());
create policy vocali_insert on public.vocali for insert to authenticated with check (public.is_member() and by_id = auth.uid());
create policy vocali_update on public.vocali for update to authenticated using (public.is_member());
create policy vocali_delete on public.vocali for delete to authenticated using (public.is_director() or by_id = auth.uid());
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vocali') then
    alter publication supabase_realtime add table public.vocali;
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit) values ('audio', 'audio', false, 26214400)
  on conflict (id) do update set public = false, file_size_limit = 26214400;
drop policy if exists audio_read   on storage.objects;
drop policy if exists audio_insert on storage.objects;
drop policy if exists audio_delete on storage.objects;
create policy audio_read   on storage.objects for select to authenticated
  using (bucket_id = 'audio' and public.is_reader());
create policy audio_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'audio' and public.is_member());
create policy audio_delete on storage.objects for delete to authenticated
  using (bucket_id = 'audio' and public.is_member());
-- ---------- Ruoli per testata (02/11/2026) ----------
-- Ognuno può avere un ruolo diverso per ogni testata (lettore, redattore, direttore) o nessun ruolo.
-- Tutti gli approvati leggono tutte le testate; si scrive, corregge e pubblica solo dove si ha il ruolo.
-- profiles.role ora vale: in_attesa (non approvato), lettore (approvato), direttore (= AMMINISTRATORE: tutto su tutte le testate).
-- 'redattore' in profiles resta valido solo per compatibilità.
create table if not exists public.ruoli_testata (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  testata     text not null check (testata in ('fuxia','rnv','ch1')),
  role        text not null check (role in ('lettore','redattore','direttore')),
  updated_at  timestamptz not null default now(),
  primary key (user_id, testata)
);

create or replace function public.is_admin() returns boolean
language sql stable set search_path = public as $$ select coalesce(public.my_role() = 'direttore', false) $$;
create or replace function public.t_role(t text) returns text
language sql stable security definer set search_path = public as $$
  select r.role from public.ruoli_testata r join public.profiles p on p.id = r.user_id
   where r.user_id = auth.uid() and r.testata = t and p.role <> 'in_attesa'
$$;
-- Scrive in almeno una testata (serve per foto, rubrica e materiali senza testata).
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (public.is_reader() and exists (
    select 1 from public.ruoli_testata where user_id = auth.uid() and role in ('redattore','direttore')))
$$;
-- Direttore di almeno una testata.
create or replace function public.is_director() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or (public.is_reader() and exists (
    select 1 from public.ruoli_testata where user_id = auth.uid() and role = 'direttore'))
$$;
create or replace function public.can_write(t text) returns boolean
language sql stable set search_path = public as $$
  select case when t is null then public.is_member()
              else public.is_admin() or coalesce(public.t_role(t) in ('redattore','direttore'), false) end
$$;
create or replace function public.is_director_of(t text) returns boolean
language sql stable set search_path = public as $$
  select case when t is null then public.is_director()
              else public.is_admin() or coalesce(public.t_role(t) = 'direttore', false) end
$$;
create or replace function public.art_testata(aid uuid) returns text
language sql stable security definer set search_path = public as $$ select testata from public.articles where id = aid $$;

-- Articoli
drop policy if exists articles_insert on public.articles;
drop policy if exists articles_update on public.articles;
drop policy if exists articles_delete on public.articles;
create policy articles_insert on public.articles for insert to authenticated
  with check (public.can_write(testata) and author_id = auth.uid());
create policy articles_update on public.articles for update to authenticated
  using (public.can_write(testata)) with check (public.can_write(testata));
create policy articles_delete on public.articles for delete to authenticated
  using (public.is_director_of(testata) or (author_id = auth.uid() and status <> 'pubblicato' and public.can_write(testata)));

create or replace function public.guard_article() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pubblicato' and not public.is_director_of(new.testata) then
      raise exception 'Solo il direttore della testata può pubblicare';
    end if;
    return new;
  end if;
  if public.is_director_of(old.testata) and public.is_director_of(new.testata) then return new; end if;
  if new.status is distinct from old.status and (new.status = 'pubblicato' or old.status = 'pubblicato') then
    raise exception 'Solo il direttore della testata può pubblicare o ritirare un articolo';
  end if;
  if old.status = 'pubblicato' and
     (new.title, new.kicker, new.summary, new.section, new.firma, new.body, new.cover_id, new.gallery, new.testata)
     is distinct from
     (old.title, old.kicker, old.summary, old.section, old.firma, old.body, old.cover_id, old.gallery, old.testata) then
    raise exception 'Un articolo pubblicato può modificarlo solo il direttore della testata';
  end if;
  return new;
end $$;

create or replace function public.acquire_lock(aid uuid, secs int default 45) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_write(public.art_testata(aid)) then return false; end if;
  update public.articles
     set locked_by = auth.uid(), locked_until = now() + make_interval(secs => secs)
   where id = aid
     and (locked_by is null or locked_until < now() or locked_by = auth.uid());
  return found;
end $$;

-- Note sugli articoli: le lascia chi scrive in quella testata.
drop policy if exists notes_insert on public.notes;
drop policy if exists notes_update on public.notes;
drop policy if exists notes_delete on public.notes;
create policy notes_insert on public.notes for insert to authenticated
  with check (by_id = auth.uid() and public.can_write(public.art_testata(article_id)));
create policy notes_update on public.notes for update to authenticated
  using (public.can_write(public.art_testata(article_id)));
create policy notes_delete on public.notes for delete to authenticated
  using (by_id = auth.uid() or public.is_director_of(public.art_testata(article_id)));

-- Appunti
drop policy if exists appunti_insert on public.appunti;
drop policy if exists appunti_update on public.appunti;
drop policy if exists appunti_delete on public.appunti;
create policy appunti_insert on public.appunti for insert to authenticated
  with check (public.can_write(testata) and by_id = auth.uid());
create policy appunti_update on public.appunti for update to authenticated
  using (public.can_write(testata)) with check (public.can_write(testata));
create policy appunti_delete on public.appunti for delete to authenticated
  using (by_id = auth.uid() or public.is_director_of(testata));

-- Appuntamenti
drop policy if exists appuntamenti_insert on public.appuntamenti;
drop policy if exists appuntamenti_update on public.appuntamenti;
drop policy if exists appuntamenti_delete on public.appuntamenti;
create policy appuntamenti_insert on public.appuntamenti for insert to authenticated
  with check (public.can_write(testata) and created_by = auth.uid()
              and (visibility <> 'direzione' or public.is_director_of(testata)));
create policy appuntamenti_update on public.appuntamenti for update to authenticated
  using (public.can_write(testata) and public.can_see_appuntamento(visibility, created_by, assignee_id))
  with check (public.can_write(testata) and public.can_see_appuntamento(visibility, created_by, assignee_id)
              and (visibility <> 'direzione' or public.is_director_of(testata)));
create policy appuntamenti_delete on public.appuntamenti for delete to authenticated
  using (created_by = auth.uid() or public.is_director_of(testata));

-- Vocali
drop policy if exists vocali_insert on public.vocali;
drop policy if exists vocali_update on public.vocali;
drop policy if exists vocali_delete on public.vocali;
create policy vocali_insert on public.vocali for insert to authenticated
  with check (public.can_write(testata) and by_id = auth.uid());
create policy vocali_update on public.vocali for update to authenticated
  using (public.can_write(testata)) with check (public.can_write(testata));
create policy vocali_delete on public.vocali for delete to authenticated
  using (by_id = auth.uid() or public.is_director_of(testata));

-- Menabò (non usato, ma coerente)
drop policy if exists menabo_write on public.menabo;
create policy menabo_write on public.menabo for all to authenticated
  using (public.is_director_of(testata)) with check (public.is_director_of(testata));

-- Squadra: ogni direttore approva i nuovi iscritti e gestisce i ruoli della sua testata;
-- solo un amministratore nomina altri amministratori o toglie l'accesso.
create or replace function public.guard_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    if public.is_admin() then
      if old.role = 'direttore' and new.role <> 'direttore'
         and (select count(*) from public.profiles where role = 'direttore') <= 1 then
        raise exception 'Serve almeno un amministratore: nominane un altro prima';
      end if;
    elsif public.is_director() and old.role = 'in_attesa' and new.role = 'lettore' then
      null;
    else
      raise exception 'Solo un amministratore può cambiare questo accesso';
    end if;
  end if;
  new.id := old.id;
  new.email := old.email;
  return new;
end $$;

alter table public.ruoli_testata enable row level security;
grant select, insert, update, delete on public.ruoli_testata to authenticated;
drop policy if exists ruoli_read   on public.ruoli_testata;
drop policy if exists ruoli_insert on public.ruoli_testata;
drop policy if exists ruoli_update on public.ruoli_testata;
drop policy if exists ruoli_delete on public.ruoli_testata;
create policy ruoli_read   on public.ruoli_testata for select to authenticated using (user_id = auth.uid() or public.is_reader());
create policy ruoli_insert on public.ruoli_testata for insert to authenticated
  with check (public.is_director_of(testata)
              and exists (select 1 from public.profiles p where p.id = user_id and p.role <> 'in_attesa'));
create policy ruoli_update on public.ruoli_testata for update to authenticated
  using (public.is_director_of(testata)) with check (public.is_director_of(testata));
create policy ruoli_delete on public.ruoli_testata for delete to authenticated
  using (public.is_director_of(testata));
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ruoli_testata') then
    alter publication supabase_realtime add table public.ruoli_testata;
  end if;
end $$;

revoke execute on function public.t_role(text) from public, anon;
revoke execute on function public.art_testata(uuid) from public, anon;
revoke execute on function public.is_member() from public, anon;
revoke execute on function public.is_director() from public, anon;
grant execute on function public.t_role(text) to authenticated;
grant execute on function public.art_testata(uuid) to authenticated;
grant execute on function public.is_member() to authenticated;
grant execute on function public.is_director() to authenticated;

-- Passaggio iniziale: ognuno tiene il ruolo che aveva, uguale su tutte e tre le testate.
insert into public.ruoli_testata (user_id, testata, role)
select p.id, t, p.role from public.profiles p cross join unnest(array['fuxia','rnv','ch1']) as t
 where p.role in ('lettore','redattore','direttore')
   and not exists (select 1 from public.ruoli_testata r where r.user_id = p.id)
on conflict do nothing;
alter table public.profiles disable trigger guard_profile;
update public.profiles set role = 'lettore' where role = 'redattore';
alter table public.profiles enable trigger guard_profile;
