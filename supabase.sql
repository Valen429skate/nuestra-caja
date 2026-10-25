-- Nuestra Caja — base de datos para la app propia (Supabase).
-- Pega este archivo completo en Supabase → SQL Editor → Run. Se puede ejecutar más de una vez sin romper nada.

-- Un "hogar" = vuestra caja compartida. Máximo dos personas.
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{8}$'),
  created_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  person text not null check (person in ('p1', 'p2')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (household_id, person),
  unique (user_id)
);

-- Todos los datos de la app (movimientos, categorías, huchas, lista de la compra…) como documentos JSON.
create table if not exists public.docs (
  household_id uuid not null references public.households (id) on delete cascade,
  col text not null check (col ~ '^[a-z]{1,20}$'),
  id text not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 65000),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (household_id, col, id)
);
create index if not exists docs_household on public.docs (household_id);

-- ¿Pertenece el usuario actual a este hogar?
create or replace function public.is_household_member(p_household uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.household_members m where m.household_id = p_household and m.user_id = auth.uid());
$$;

-- Hogar del usuario actual (o null).
create or replace function public.my_household() returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object('household_id', h.id, 'code', h.code, 'person', m.person,
                           'members', (select count(*) from public.household_members x where x.household_id = h.id))
  from public.household_members m join public.households h on h.id = m.household_id
  where m.user_id = auth.uid();
$$;

-- Crear vuestra caja (quien la crea es la persona 1). Si ya tienes una, la devuelve.
create or replace function public.create_household() returns json
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_code text; v_hex text; v_alpha text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.household_members where user_id = v_uid) then return public.my_household(); end if;
  loop
    v_code := '';
    -- Aleatoriedad criptográfica de gen_random_uuid (núcleo de Postgres, sin extensiones)
    v_hex := replace(gen_random_uuid()::text, '-', '');
    for i in 1..8 loop v_code := v_code || substr(v_alpha, 1 + (('x' || substr(v_hex, i * 2 - 1, 2))::bit(8)::int % 32), 1); end loop;
    exit when not exists (select 1 from public.households where code = v_code);
  end loop;
  insert into public.households (code, created_by) values (v_code, v_uid) returning id into v_id;
  insert into public.household_members (household_id, user_id, person) values (v_id, v_uid, 'p1');
  return public.my_household();
end $$;

-- Unirse con el código de tu pareja (pasas a ser la persona 2).
create or replace function public.join_household(p_code text) returns json
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_h public.households; v_n int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_h from public.households where code = upper(trim(p_code)) for update;
  if not found then raise exception 'code_not_found' using errcode = '22023'; end if;
  if exists (select 1 from public.household_members where user_id = v_uid and household_id = v_h.id) then return public.my_household(); end if;
  if exists (select 1 from public.household_members where user_id = v_uid) then raise exception 'already_in_household' using errcode = '22023'; end if;
  select count(*) into v_n from public.household_members where household_id = v_h.id;
  if v_n >= 2 then raise exception 'household_full' using errcode = '22023'; end if;
  insert into public.household_members (household_id, user_id, person) values (v_h.id, v_uid, 'p2');
  return public.my_household();
end $$;

-- Seguridad: cada persona solo ve y toca los datos de su propio hogar.
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.docs enable row level security;

drop policy if exists households_select on public.households;
create policy households_select on public.households for select to authenticated using (public.is_household_member(id));
drop policy if exists members_select on public.household_members;
create policy members_select on public.household_members for select to authenticated using (public.is_household_member(household_id));
drop policy if exists docs_select on public.docs;
create policy docs_select on public.docs for select to authenticated using (public.is_household_member(household_id));
drop policy if exists docs_insert on public.docs;
create policy docs_insert on public.docs for insert to authenticated with check (public.is_household_member(household_id));
drop policy if exists docs_update on public.docs;
create policy docs_update on public.docs for update to authenticated using (public.is_household_member(household_id)) with check (public.is_household_member(household_id));
drop policy if exists docs_delete on public.docs;
create policy docs_delete on public.docs for delete to authenticated using (public.is_household_member(household_id));

create or replace function public.docs_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs for each row execute function public.docs_touch();

revoke all on public.households, public.household_members, public.docs from anon;
grant select on public.households, public.household_members to authenticated;
grant select, insert, update, delete on public.docs to authenticated;
revoke execute on function public.create_household(), public.join_household(text), public.my_household(), public.is_household_member(uuid) from public, anon;
grant execute on function public.create_household(), public.join_household(text), public.my_household(), public.is_household_member(uuid) to authenticated;

-- Tiempo real: los cambios de uno llegan al instante al móvil del otro.
alter table public.docs replica identity full;
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;
