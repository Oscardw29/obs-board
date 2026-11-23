-- ============================================================================
-- OBoardS - Esquema Supabase (PostgreSQL + RLS + Storage)
-- Ejecuta este archivo completo en el SQL Editor de tu proyecto Supabase.
-- Es 100% idempotente: sirve tanto para instalaciones nuevas como para migrar.
-- ============================================================================

-- 1. Tableros
create table if not exists public.boards (
  id text primary key,
  title text not null default 'Nuevo Tablero OBoardS',
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_email text not null default '',
  owner_name text not null default 'Propietario',
  obs_token text not null unique,
  stage_width integer not null default 1920,
  stage_height integer not null default 1080,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Miembros invitados (control de acceso privado por correo)
create table if not exists public.board_members (
  id text primary key,
  board_id text not null references public.boards(id) on delete cascade,
  email text not null,
  user_id uuid references auth.users(id) on delete set null,
  name text,
  role text not null check (role in ('editor', 'viewer')) default 'editor',
  paused boolean not null default false,
  invited_at timestamptz not null default now(),
  unique (board_id, email)
);

alter table public.board_members
  add column if not exists paused boolean not null default false;

-- 3. Elementos del tablero (trazos, formas, textos, imágenes, videos/clips, documentos)
create table if not exists public.board_elements (
  id text primary key,
  board_id text not null references public.boards(id) on delete cascade,
  z_index integer not null default 1,
  visible boolean not null default true,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- 4. Carpetas de la biblioteca compartida de media
create table if not exists public.media_folders (
  id text primary key,
  board_id text references public.boards(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#38bdf8',
  created_at timestamptz not null default now()
);

-- 5. Biblioteca persistente de media (videos, imágenes, documentos, fuentes)
create table if not exists public.media_assets (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  board_id text references public.boards(id) on delete set null,
  folder_id text references public.media_folders(id) on delete set null,
  name text not null,
  kind text not null check (kind in ('video', 'image', 'document', 'font')),
  mime_type text not null,
  url text not null,
  file_name text not null,
  size_bytes bigint not null default 0,
  width integer,
  height integer,
  duration_sec double precision,
  tags text[] not null default '{}',
  color text,
  uploaded_by_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Migraciones idempotentes sobre media_assets si ya existía previamente
alter table public.media_assets
  add column if not exists board_id text references public.boards(id) on delete set null;
alter table public.media_assets
  add column if not exists folder_id text references public.media_folders(id) on delete set null;
alter table public.media_assets
  add column if not exists color text;
alter table public.media_assets
  add column if not exists uploaded_by_name text;
alter table public.media_assets
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.media_assets
  drop constraint if exists media_assets_kind_check;
alter table public.media_assets
  add constraint media_assets_kind_check
  check (kind in ('video', 'image', 'document', 'font'));

-- Índices
create index if not exists idx_boards_owner on public.boards(owner_id);
create index if not exists idx_board_members_board on public.board_members(board_id);
create index if not exists idx_board_members_email on public.board_members(lower(email));
create index if not exists idx_board_elements_board_z on public.board_elements(board_id, z_index);
create index if not exists idx_media_folders_board on public.media_folders(board_id, created_at asc);
create index if not exists idx_media_folders_owner on public.media_folders(owner_id, created_at asc);
create index if not exists idx_media_assets_owner on public.media_assets(owner_id, created_at desc);
create index if not exists idx_media_assets_board on public.media_assets(board_id, created_at desc);
create index if not exists idx_media_assets_folder on public.media_assets(folder_id);

-- ============================================================================
-- Funciones helper de permisos (SECURITY DEFINER para evitar recursión RLS)
-- ============================================================================

create or replace function public.can_access_board(target_board_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.boards b
    where b.id = target_board_id
      and b.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.board_members m
    where m.board_id = target_board_id
      and lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.can_edit_board(target_board_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.boards b
    where b.id = target_board_id
      and b.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.board_members m
    where m.board_id = target_board_id
      and m.role = 'editor'
      and coalesce(m.paused, false) = false
      and lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create or replace function public.is_board_owner(target_board_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.boards b
    where b.id = target_board_id
      and b.owner_id = auth.uid()
  );
$$;

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

alter table public.boards enable row level security;
alter table public.board_members enable row level security;
alter table public.board_elements enable row level security;
alter table public.media_folders enable row level security;
alter table public.media_assets enable row level security;

-- Boards policies
drop policy if exists "boards_select_accessible" on public.boards;
create policy "boards_select_accessible" on public.boards
  for select using (public.can_access_board(id));

drop policy if exists "boards_insert_own" on public.boards;
create policy "boards_insert_own" on public.boards
  for insert with check (owner_id = auth.uid());

drop policy if exists "boards_update_editors" on public.boards;
create policy "boards_update_editors" on public.boards
  for update using (public.can_edit_board(id));

drop policy if exists "boards_delete_owner" on public.boards;
create policy "boards_delete_owner" on public.boards
  for delete using (owner_id = auth.uid());

-- Board members policies
drop policy if exists "members_select_accessible" on public.board_members;
create policy "members_select_accessible" on public.board_members
  for select using (public.can_access_board(board_id));

drop policy if exists "members_manage_owner" on public.board_members;
create policy "members_manage_owner" on public.board_members
  for all using (public.is_board_owner(board_id))
  with check (public.is_board_owner(board_id));

-- Permisos explícitos de tabla y funciones para PostgREST (incluyendo service_role para sb_secret_...)
grant usage on schema public to anon, authenticated, service_role;
grant all on table public.boards, public.board_members, public.board_elements, public.media_folders, public.media_assets to authenticated, service_role;
grant execute on function public.can_access_board(text) to authenticated, service_role;
grant execute on function public.can_edit_board(text) to authenticated, service_role;
grant execute on function public.is_board_owner(text) to authenticated, service_role;

-- Board elements policies
drop policy if exists "elements_select_accessible" on public.board_elements;
create policy "elements_select_accessible" on public.board_elements
  for select using (public.can_access_board(board_id));

drop policy if exists "elements_modify_editors" on public.board_elements;
create policy "elements_modify_editors" on public.board_elements
  for all using (public.can_edit_board(board_id))
  with check (public.can_edit_board(board_id));

-- Media folders policies (compartidas por tablero o personales)
drop policy if exists "media_folders_select" on public.media_folders;
create policy "media_folders_select" on public.media_folders
  for select using (
    owner_id = auth.uid()
    or (board_id is not null and public.can_access_board(board_id))
  );

drop policy if exists "media_folders_write" on public.media_folders;
create policy "media_folders_write" on public.media_folders
  for all using (
    owner_id = auth.uid()
    or (board_id is not null and public.can_edit_board(board_id))
  )
  with check (
    owner_id = auth.uid()
    or (board_id is not null and public.can_edit_board(board_id))
  );

-- Media assets policies (compartidas por tablero o personales)
drop policy if exists "media_owner_all" on public.media_assets;
drop policy if exists "media_assets_select" on public.media_assets;
create policy "media_assets_select" on public.media_assets
  for select using (
    owner_id = auth.uid()
    or (board_id is not null and public.can_access_board(board_id))
  );

drop policy if exists "media_assets_insert" on public.media_assets;
create policy "media_assets_insert" on public.media_assets
  for insert with check (
    owner_id = auth.uid()
    or (board_id is not null and public.can_edit_board(board_id))
  );

drop policy if exists "media_assets_update" on public.media_assets;
create policy "media_assets_update" on public.media_assets
  for update using (
    owner_id = auth.uid()
    or (board_id is not null and public.can_edit_board(board_id))
  );

drop policy if exists "media_assets_delete" on public.media_assets;
create policy "media_assets_delete" on public.media_assets
  for delete using (
    owner_id = auth.uid()
    or (board_id is not null and public.can_edit_board(board_id))
  );

-- ============================================================================
-- Storage Bucket para videos MP4/WebM, imágenes, documentos y fuentes
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('obs-media', 'obs-media', true, 52428800)
on conflict (id) do update
set public = true, file_size_limit = 52428800;

drop policy if exists "obs_media_public_read" on storage.objects;
create policy "obs_media_public_read" on storage.objects
  for select using (bucket_id = 'obs-media');

drop policy if exists "obs_media_auth_upload" on storage.objects;
create policy "obs_media_auth_upload" on storage.objects
  for insert with check (
    bucket_id = 'obs-media'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "obs_media_owner_update" on storage.objects;
create policy "obs_media_owner_update" on storage.objects
  for update using (
    bucket_id = 'obs-media'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "obs_media_owner_delete" on storage.objects;
create policy "obs_media_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'obs-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
