-- =====================================================================
-- Dashboard de Área Display | Honor
-- Esquema Supabase (PostgreSQL). Ejecutar completo en: Supabase > SQL Editor.
-- Es idempotente: se puede volver a ejecutar sin perder datos.
-- =====================================================================

-- ---------- Tablas ----------

create table if not exists public.zonas (
  id         smallserial primary key,
  nombre     text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.perfiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nombre     text,
  rol        text not null default 'viewer' check (rol in ('admin', 'registro', 'viewer')),
  zona_id    smallint references public.zonas (id),
  created_at timestamptz not null default now()
);

create table if not exists public.marcas (
  nombre text primary key,
  orden  int  not null default 100
);

create table if not exists public.tiendas (
  codigo     text primary key,                 -- Código Honor+
  nombre     text not null,
  cliente    text not null,                    -- cadena / canal
  ciudad     text not null,
  region     text,
  cobertura  text not null check (cobertura in ('Promotor', 'Middle Management', 'Sin cobertura', 'Cerrada')),
  zona_id    smallint not null references public.zonas (id),
  activa     boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Cada subida del Excel es una carga. Se guardan todas: así hay historial.
create table if not exists public.cargas (
  id         bigserial primary key,
  zona_id    smallint not null references public.zonas (id),
  archivo    text,
  por        uuid references auth.users (id),
  marcas     text[] not null,                  -- orden de columnas de esa carga
  resumen    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cargas_zona_fecha on public.cargas (zona_id, created_at desc);

create table if not exists public.mediciones (
  carga_id      bigint   not null references public.cargas (id) on delete cascade,
  tienda_codigo text     not null references public.tiendas (codigo),
  metrica       text     not null check (metrica in ('exhibiciones', 'muebles_dc', 'muebles_dz', 'promotores')),
  marca         text     not null references public.marcas (nombre),
  valor         integer  not null check (valor >= 0),
  fecha         date,                          -- fecha de levantamiento en tienda
  primary key (carga_id, tienda_codigo, metrica, marca)
);

-- Bases creadas antes de separar Muebles en DC y DZ (ver supabase/migraciones/).
alter table public.mediciones drop constraint if exists mediciones_metrica_check;
update public.mediciones set metrica = 'muebles_dc' where metrica = 'muebles';
alter table public.mediciones add constraint mediciones_metrica_check
  check (metrica in ('exhibiciones', 'muebles_dc', 'muebles_dz', 'promotores'));

-- ---------- Funciones auxiliares ----------

create or replace function public.es_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin');
$$;

-- Perfil automático (rol viewer) al crear un usuario en Supabase Auth.
create or replace function public.crear_perfil()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- ---------- Publicar una carga (todo o nada) ----------
-- p = {
--   zona: 'Norte', archivo: 'x.xlsx', marcas: ['Honor', ...],
--   tiendas: [{codigo, tienda, cliente, ciudad, region, cobertura}],
--   mediciones: [{codigo, metrica, marca, valor, fecha}],
--   resumen: {...}
-- }
create or replace function public.publicar_carga(p jsonb)
returns bigint
language plpgsql security invoker set search_path = public
as $$
declare
  v_zona  smallint;
  v_carga bigint;
begin
  if not public.es_admin() then
    raise exception 'Solo los administradores pueden publicar datos';
  end if;

  select id into v_zona from public.zonas where nombre = p ->> 'zona';
  if v_zona is null then
    raise exception 'La zona "%" no existe', p ->> 'zona';
  end if;

  insert into public.marcas (nombre, orden)
  select m, ord::int from jsonb_array_elements_text(p -> 'marcas') with ordinality as t(m, ord)
  on conflict (nombre) do update set orden = excluded.orden;

  insert into public.tiendas (codigo, nombre, cliente, ciudad, region, cobertura, zona_id, activa, updated_at)
  select t ->> 'codigo', t ->> 'tienda', t ->> 'cliente', t ->> 'ciudad', nullif(t ->> 'region', ''),
         t ->> 'cobertura', v_zona, (t ->> 'cobertura') <> 'Cerrada', now()
  from jsonb_array_elements(p -> 'tiendas') t
  on conflict (codigo) do update set
    nombre = excluded.nombre, cliente = excluded.cliente, ciudad = excluded.ciudad,
    region = excluded.region, cobertura = excluded.cobertura, zona_id = excluded.zona_id,
    activa = excluded.activa, updated_at = now();

  insert into public.cargas (zona_id, archivo, por, marcas, resumen)
  values (v_zona, p ->> 'archivo', auth.uid(),
          array(select jsonb_array_elements_text(p -> 'marcas')), coalesce(p -> 'resumen', '{}'::jsonb))
  returning id into v_carga;

  insert into public.mediciones (carga_id, tienda_codigo, metrica, marca, valor, fecha)
  select v_carga, m ->> 'codigo', m ->> 'metrica', m ->> 'marca',
         round((m ->> 'valor')::numeric)::int, nullif(m ->> 'fecha', '')::date
  from jsonb_array_elements(p -> 'mediciones') m;

  return v_carga;
end $$;

-- ---------- Datos del dashboard (una sola llamada, sin límite de filas) ----------
-- Devuelve la última carga de la zona, o la indicada en p_carga.
create or replace function public.dashboard_datos(p_zona text default 'Norte', p_carga bigint default null)
returns jsonb
language sql stable security invoker set search_path = public
as $$
  with z as (select id from public.zonas where nombre = p_zona),
  c as (
    select c.* from public.cargas c, z
    where c.zona_id = z.id and (p_carga is null or c.id = p_carga)
    order by c.created_at desc limit 1
  )
  select case when not exists (select 1 from c) then null else jsonb_build_object(
    'carga', (select jsonb_build_object('id', id, 'archivo', archivo, 'created_at', created_at, 'marcas', marcas) from c),
    'tiendas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'codigo', t.codigo, 'tienda', t.nombre, 'cliente', t.cliente, 'ciudad', t.ciudad,
        'region', t.region, 'cobertura', t.cobertura) order by t.codigo), '[]'::jsonb)
      from public.tiendas t, z where t.zona_id = z.id
    ),
    'mediciones', (
      select coalesce(jsonb_agg(jsonb_build_array(m.tienda_codigo, m.metrica, m.marca, m.valor, m.fecha)), '[]'::jsonb)
      from public.mediciones m where m.carga_id = (select id from c)
    )
  ) end;
$$;

-- ---------- Seguridad (Row Level Security) ----------
-- Leer: cualquier usuario con sesión. Escribir: solo admin.

alter table public.zonas      enable row level security;
alter table public.perfiles   enable row level security;
alter table public.marcas     enable row level security;
alter table public.tiendas    enable row level security;
alter table public.cargas     enable row level security;
alter table public.mediciones enable row level security;

do $$
declare t text;
begin
  foreach t in array array['zonas', 'marcas', 'tiendas', 'cargas', 'mediciones'] loop
    execute format('drop policy if exists "%1$s leer" on public.%1$s', t);
    execute format('drop policy if exists "%1$s admin escribe" on public.%1$s', t);
    execute format('create policy "%1$s leer" on public.%1$s for select to authenticated using (true)', t);
    execute format('create policy "%1$s admin escribe" on public.%1$s for all to authenticated using (public.es_admin()) with check (public.es_admin())', t);
  end loop;
end $$;

drop policy if exists "perfiles leer" on public.perfiles;
drop policy if exists "perfiles admin escribe" on public.perfiles;
create policy "perfiles leer" on public.perfiles for select to authenticated using (true);
create policy "perfiles admin escribe" on public.perfiles for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- ---------- Datos base ----------
insert into public.zonas (nombre) values ('Norte'), ('Centro'), ('Sur') on conflict (nombre) do nothing;

-- =====================================================================
-- Bitácora de tiendas: acciones del equipo y ejecutivos por tienda.
-- Idempotente: se puede ejecutar más de una vez.
--
-- Roles (perfiles.rol):
--   admin    > sube el Excel y registra en la bitácora
--   registro > registra en la bitácora (supervisor, entrenador)
--   viewer   > solo ve
-- =====================================================================

alter table public.perfiles add column if not exists cargo text;
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check check (rol in ('admin', 'registro', 'viewer'));

create or replace function public.puede_registrar()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol in ('admin', 'registro'));
$$;

create table if not exists public.ejecutivos (
  id            bigserial primary key,
  tienda_codigo text not null references public.tiendas (codigo),
  nombre        text not null check (length(btrim(nombre)) between 2 and 80),
  activo        boolean not null default true,
  creado_por    uuid default auth.uid() references auth.users (id),
  created_at    timestamptz not null default now()
);
create unique index if not exists ejecutivos_tienda_nombre on public.ejecutivos (tienda_codigo, lower(btrim(nombre)));

create table if not exists public.acciones (
  id            bigserial primary key,
  tienda_codigo text not null references public.tiendas (codigo),
  fecha         date not null,
  tipo          text not null check (tipo in ('visita', 'venta', 'incentivo', 'capacitacion', 'implementacion', 'observacion')),
  ejecutivo_id  bigint references public.ejecutivos (id),
  detalle       text not null default '' check (length(detalle) <= 2000),
  unidades      integer check (unidades is null or unidades >= 0),
  costo         integer check (costo is null or costo >= 0),
  pendiente     boolean not null default false,
  hecho         boolean not null default false,
  hecho_por     uuid references auth.users (id),
  hecho_at      timestamptz,
  creado_por    uuid not null default auth.uid() references auth.users (id),
  created_at    timestamptz not null default now(),
  constraint acciones_venta_completa check (tipo <> 'venta' or (ejecutivo_id is not null and unidades > 0)),
  constraint acciones_incentivo_costo check (tipo <> 'incentivo' or costo is not null)
);
create index if not exists acciones_tienda_fecha on public.acciones (tienda_codigo, fecha desc);
create index if not exists acciones_fecha on public.acciones (fecha desc);

-- El ejecutivo debe ser de la misma tienda; unidades y costo solo en su tipo.
create or replace function public.validar_accion()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.ejecutivo_id is not null and not exists (
    select 1 from public.ejecutivos e where e.id = new.ejecutivo_id and e.tienda_codigo = new.tienda_codigo
  ) then
    raise exception 'El ejecutivo no pertenece a esta tienda';
  end if;
  if new.tipo <> 'venta' then new.unidades := null; end if;
  if new.tipo <> 'incentivo' then new.costo := null; end if;
  return new;
end $$;

drop trigger if exists acciones_validar on public.acciones;
create trigger acciones_validar before insert or update on public.acciones
  for each row execute function public.validar_accion();

-- Marcar un pendiente como hecho (o reabrirlo). Cualquiera que registra puede hacerlo.
create or replace function public.marcar_pendiente(p_id bigint, p_hecho boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.puede_registrar() then
    raise exception 'No tienes permiso para actualizar pendientes';
  end if;
  update public.acciones
     set hecho = p_hecho,
         hecho_por = case when p_hecho then auth.uid() end,
         hecho_at = case when p_hecho then now() end
   where id = p_id and pendiente;
  if not found then
    raise exception 'Pendiente no encontrado';
  end if;
end $$;
revoke all on function public.marcar_pendiente(bigint, boolean) from public, anon;
grant execute on function public.marcar_pendiente(bigint, boolean) to authenticated;

-- Seguridad: leer con sesión; registrar solo admin/registro y a nombre propio.
alter table public.ejecutivos enable row level security;
alter table public.acciones enable row level security;

drop policy if exists "ejecutivos leer" on public.ejecutivos;
drop policy if exists "ejecutivos registrar" on public.ejecutivos;
drop policy if exists "ejecutivos admin" on public.ejecutivos;
create policy "ejecutivos leer" on public.ejecutivos for select to authenticated using (true);
create policy "ejecutivos registrar" on public.ejecutivos for insert to authenticated
  with check (public.puede_registrar() and creado_por = auth.uid());
create policy "ejecutivos admin" on public.ejecutivos for update to authenticated
  using (public.es_admin()) with check (public.es_admin());

drop policy if exists "acciones leer" on public.acciones;
drop policy if exists "acciones registrar" on public.acciones;
drop policy if exists "acciones borrar" on public.acciones;
create policy "acciones leer" on public.acciones for select to authenticated using (true);
create policy "acciones registrar" on public.acciones for insert to authenticated
  with check (public.puede_registrar() and creado_por = auth.uid() and not hecho and hecho_por is null);
create policy "acciones borrar" on public.acciones for delete to authenticated
  using (public.puede_registrar() and (creado_por = auth.uid() or public.es_admin()));

grant select, insert on public.ejecutivos, public.acciones to authenticated;
grant update on public.ejecutivos to authenticated;
grant delete on public.acciones to authenticated;
grant usage on sequence public.ejecutivos_id_seq, public.acciones_id_seq to authenticated;

-- Funciones internas: no invocables desde afuera sin sesión (aviso del linter de Supabase).
revoke execute on function public.crear_perfil() from public, anon, authenticated;
revoke execute on function public.es_admin() from public, anon;
revoke execute on function public.puede_registrar() from public, anon;
grant execute on function public.es_admin() to authenticated;
grant execute on function public.puede_registrar() to authenticated;

-- =====================================================================
-- Historial por fecha de corte (supabase/migraciones/2026-10-17_historial.sql)
-- =====================================================================

alter table public.cargas add column if not exists fecha_corte date;

-- Cargas anteriores: la fecha de levantamiento más reciente, o el día en que se subió.
update public.cargas c
   set fecha_corte = coalesce(
         (select max(m.fecha) from public.mediciones m where m.carga_id = c.id),
         (c.created_at at time zone 'America/Santiago')::date)
 where c.fecha_corte is null;

alter table public.cargas alter column fecha_corte set not null;
alter table public.cargas alter column fecha_corte set default ((now() at time zone 'America/Santiago')::date);
create unique index if not exists cargas_zona_corte on public.cargas (zona_id, fecha_corte);

-- ---------- Publicar una carga (todo o nada) ----------
-- p = {
--   zona: 'Norte', archivo: 'x.xlsx', fecha_corte: 'YYYY-MM-DD', marcas: ['Honor', ...],
--   tiendas: [{codigo, tienda, cliente, ciudad, region, cobertura}],
--   mediciones: [{codigo, metrica, marca, valor, fecha}],
--   resumen: {...}
-- }
create or replace function public.publicar_carga(p jsonb)
returns bigint
language plpgsql security invoker set search_path = public
as $$
declare
  v_zona  smallint;
  v_carga bigint;
  v_corte date;
begin
  if not public.es_admin() then
    raise exception 'Solo los administradores pueden publicar datos';
  end if;

  select id into v_zona from public.zonas where nombre = p ->> 'zona';
  if v_zona is null then
    raise exception 'La zona "%" no existe', p ->> 'zona';
  end if;

  v_corte := coalesce(
    nullif(p ->> 'fecha_corte', '')::date,
    (select max(nullif(m ->> 'fecha', '')::date) from jsonb_array_elements(p -> 'mediciones') m),
    (now() at time zone 'America/Santiago')::date);
  if v_corte > (now() at time zone 'America/Santiago')::date then
    raise exception 'La fecha de corte no puede ser futura';
  end if;

  insert into public.marcas (nombre, orden)
  select m, ord::int from jsonb_array_elements_text(p -> 'marcas') with ordinality as t(m, ord)
  on conflict (nombre) do update set orden = excluded.orden;

  insert into public.tiendas (codigo, nombre, cliente, ciudad, region, cobertura, zona_id, activa, updated_at)
  select t ->> 'codigo', t ->> 'tienda', t ->> 'cliente', t ->> 'ciudad', nullif(t ->> 'region', ''),
         t ->> 'cobertura', v_zona, (t ->> 'cobertura') <> 'Cerrada', now()
  from jsonb_array_elements(p -> 'tiendas') t
  on conflict (codigo) do update set
    nombre = excluded.nombre, cliente = excluded.cliente, ciudad = excluded.ciudad,
    region = excluded.region, cobertura = excluded.cobertura, zona_id = excluded.zona_id,
    activa = excluded.activa, updated_at = now();

  -- Mismo corte: la carga nueva reemplaza a la anterior (sus mediciones se borran en cascada).
  delete from public.cargas where zona_id = v_zona and fecha_corte = v_corte;

  insert into public.cargas (zona_id, archivo, por, marcas, resumen, fecha_corte)
  values (v_zona, p ->> 'archivo', auth.uid(),
          array(select jsonb_array_elements_text(p -> 'marcas')), coalesce(p -> 'resumen', '{}'::jsonb), v_corte)
  returning id into v_carga;

  insert into public.mediciones (carga_id, tienda_codigo, metrica, marca, valor, fecha)
  select v_carga, m ->> 'codigo', m ->> 'metrica', m ->> 'marca',
         round((m ->> 'valor')::numeric)::int, nullif(m ->> 'fecha', '')::date
  from jsonb_array_elements(p -> 'mediciones') m;

  return v_carga;
end $$;

-- ---------- Datos del dashboard: el corte más reciente (o el indicado) ----------
create or replace function public.dashboard_datos(p_zona text default 'Norte', p_carga bigint default null)
returns jsonb
language sql stable security invoker set search_path = public
as $$
  with z as (select id from public.zonas where nombre = p_zona),
  c as (
    select c.* from public.cargas c, z
    where c.zona_id = z.id and (p_carga is null or c.id = p_carga)
    order by c.fecha_corte desc, c.created_at desc limit 1
  )
  select case when not exists (select 1 from c) then null else jsonb_build_object(
    'carga', (select jsonb_build_object('id', id, 'archivo', archivo, 'created_at', created_at, 'fecha_corte', fecha_corte, 'marcas', marcas) from c),
    'tiendas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'codigo', t.codigo, 'tienda', t.nombre, 'cliente', t.cliente, 'ciudad', t.ciudad,
        'region', t.region, 'cobertura', t.cobertura) order by t.codigo), '[]'::jsonb)
      from public.tiendas t, z where t.zona_id = z.id
    ),
    'mediciones', (
      select coalesce(jsonb_agg(jsonb_build_array(m.tienda_codigo, m.metrica, m.marca, m.valor, m.fecha)), '[]'::jsonb)
      from public.mediciones m where m.carga_id = (select id from c)
    )
  ) end;
$$;

-- ---------- Historial: todos los cortes de la zona en una sola llamada ----------
create or replace function public.historial_datos(p_zona text default 'Norte')
returns jsonb
language sql stable security invoker set search_path = public
as $$
  with z as (select id from public.zonas where nombre = p_zona),
  c as (
    select c.id, c.fecha_corte, c.archivo, c.created_at, c.marcas, p.nombre as por
    from public.cargas c join z on c.zona_id = z.id
    left join public.perfiles p on p.id = c.por
  )
  select jsonb_build_object(
    'cortes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'fecha_corte', fecha_corte, 'archivo', archivo, 'created_at', created_at, 'marcas', marcas, 'por', por)
        order by fecha_corte, created_at), '[]'::jsonb)
      from c
    ),
    'tiendas', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'codigo', t.codigo, 'tienda', t.nombre, 'cliente', t.cliente, 'ciudad', t.ciudad,
        'region', t.region, 'cobertura', t.cobertura) order by t.codigo), '[]'::jsonb)
      from public.tiendas t, z where t.zona_id = z.id
    ),
    'mediciones', (
      select coalesce(jsonb_agg(jsonb_build_array(m.carga_id, m.tienda_codigo, m.metrica, m.marca, m.valor, m.fecha)), '[]'::jsonb)
      from public.mediciones m where m.carga_id in (select id from c)
    )
  );
$$;

revoke execute on function public.historial_datos(text) from public, anon;
grant execute on function public.historial_datos(text) to authenticated;

-- =====================================================================
-- Ejecutivos: baja y reactivación (supabase/migraciones/2026-10-17_ejecutivos_baja.sql)
-- =====================================================================
alter table public.ejecutivos add column if not exists baja_at  timestamptz;
alter table public.ejecutivos add column if not exists baja_por uuid references auth.users (id);

-- Nombre único entre los activos. Si alguien dado de baja vuelve a la tienda, la web lo reactiva
-- (mismo registro, conserva su historial) en vez de crear uno nuevo.
create unique index if not exists ejecutivos_tienda_nombre_activo
  on public.ejecutivos (tienda_codigo, lower(btrim(nombre))) where activo;

-- Dar de baja (p_activo = false) o reactivar (true). Admin, supervisor y entrenador pueden hacerlo.
create or replace function public.cambiar_estado_ejecutivo(p_id bigint, p_activo boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.puede_registrar() then
    raise exception 'No tienes permiso para modificar ejecutivos';
  end if;
  update public.ejecutivos
     set activo = p_activo,
         baja_at = case when p_activo then null else now() end,
         baja_por = case when p_activo then null else auth.uid() end
   where id = p_id;
  if not found then
    raise exception 'Ejecutivo no encontrado';
  end if;
end $$;
revoke all on function public.cambiar_estado_ejecutivo(bigint, boolean) from public, anon;
grant execute on function public.cambiar_estado_ejecutivo(bigint, boolean) to authenticated;

-- Acciones nuevas: el ejecutivo debe ser de la tienda y estar activo.
-- (Al marcar un pendiente como hecho no se revisa el estado: la acción ya existía.)
create or replace function public.validar_accion()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.ejecutivo_id is not null and not exists (
    select 1 from public.ejecutivos e where e.id = new.ejecutivo_id and e.tienda_codigo = new.tienda_codigo
  ) then
    raise exception 'El ejecutivo no pertenece a esta tienda';
  end if;
  if tg_op = 'INSERT' and new.ejecutivo_id is not null and not exists (
    select 1 from public.ejecutivos e where e.id = new.ejecutivo_id and e.activo
  ) then
    raise exception 'El ejecutivo está dado de baja';
  end if;
  if new.tipo <> 'venta' then new.unidades := null; end if;
  if new.tipo <> 'incentivo' then new.costo := null; end if;
  return new;
end $$;

-- =====================================================================
-- Ajustes de la revisión (supabase/migraciones/2026-10-17_revision.sql)
-- =====================================================================
create or replace function public.validar_accion()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.ejecutivo_id is not null and not exists (
    select 1 from public.ejecutivos e where e.id = new.ejecutivo_id and e.tienda_codigo = new.tienda_codigo
  ) then
    raise exception 'El ejecutivo no pertenece a esta tienda';
  end if;
  if tg_op = 'INSERT' then
    if new.ejecutivo_id is not null and not exists (
      select 1 from public.ejecutivos e where e.id = new.ejecutivo_id and e.activo
    ) then
      raise exception 'El ejecutivo está dado de baja';
    end if;
    if new.fecha > (now() at time zone 'America/Santiago')::date then
      raise exception 'La fecha no puede ser futura';
    end if;
    if new.unidades > 1000 then
      raise exception 'Demasiados equipos para un solo registro (máximo 1.000)';
    end if;
    if new.costo > 10000000 then
      raise exception 'Costo demasiado alto para un incentivo (máximo $10.000.000)';
    end if;
  end if;
  if new.tipo <> 'venta' then new.unidades := null; end if;
  if new.tipo <> 'incentivo' then new.costo := null; end if;
  return new;
end $$;

-- ---------- Publicar una carga (todo o nada) ----------
-- p = {
--   zona: 'Norte', archivo: 'x.xlsx', fecha_corte: 'YYYY-MM-DD', marcas: ['Honor', ...],
--   tiendas: [{codigo, tienda, cliente, ciudad, region, cobertura}],
--   mediciones: [{codigo, metrica, marca, valor, fecha}],
--   resumen: {...}
-- }
create or replace function public.publicar_carga(p jsonb)
returns bigint
language plpgsql security invoker set search_path = public
as $$
declare
  v_zona  smallint;
  v_carga bigint;
  v_corte date;
  v_ultimo boolean;
begin
  if not public.es_admin() then
    raise exception 'Solo los administradores pueden publicar datos';
  end if;

  select id into v_zona from public.zonas where nombre = p ->> 'zona';
  if v_zona is null then
    raise exception 'La zona "%" no existe', p ->> 'zona';
  end if;

  v_corte := coalesce(
    nullif(p ->> 'fecha_corte', '')::date,
    (select max(nullif(m ->> 'fecha', '')::date) from jsonb_array_elements(p -> 'mediciones') m),
    (now() at time zone 'America/Santiago')::date);
  if v_corte > (now() at time zone 'America/Santiago')::date then
    raise exception 'La fecha de corte no puede ser futura';
  end if;

  -- Solo el corte más reciente actualiza los datos de las tiendas (cobertura, cliente, ciudad).
  -- Un Excel antiguo, subido para cargar historia, agrega tiendas nuevas pero no pisa las actuales.
  v_ultimo := v_corte >= coalesce((select max(fecha_corte) from public.cargas where zona_id = v_zona), v_corte);

  insert into public.marcas (nombre, orden)
  select m, ord::int from jsonb_array_elements_text(p -> 'marcas') with ordinality as t(m, ord)
  on conflict (nombre) do update set orden = excluded.orden;

  insert into public.tiendas (codigo, nombre, cliente, ciudad, region, cobertura, zona_id, activa, updated_at)
  select t ->> 'codigo', t ->> 'tienda', t ->> 'cliente', t ->> 'ciudad', nullif(t ->> 'region', ''),
         t ->> 'cobertura', v_zona, (t ->> 'cobertura') <> 'Cerrada', now()
  from jsonb_array_elements(p -> 'tiendas') t
  on conflict (codigo) do update set
    nombre = excluded.nombre, cliente = excluded.cliente, ciudad = excluded.ciudad,
    region = excluded.region, cobertura = excluded.cobertura, zona_id = excluded.zona_id,
    activa = excluded.activa, updated_at = now()
  where v_ultimo;

  -- Mismo corte: la carga nueva reemplaza a la anterior (sus mediciones se borran en cascada).
  delete from public.cargas where zona_id = v_zona and fecha_corte = v_corte;

  insert into public.cargas (zona_id, archivo, por, marcas, resumen, fecha_corte)
  values (v_zona, p ->> 'archivo', auth.uid(),
          array(select jsonb_array_elements_text(p -> 'marcas')), coalesce(p -> 'resumen', '{}'::jsonb), v_corte)
  returning id into v_carga;

  insert into public.mediciones (carga_id, tienda_codigo, metrica, marca, valor, fecha)
  select v_carga, m ->> 'codigo', m ->> 'metrica', m ->> 'marca',
         round((m ->> 'valor')::numeric)::int, nullif(m ->> 'fecha', '')::date
  from jsonb_array_elements(p -> 'mediciones') m;

  return v_carga;
end $$;


-- =====================================================================
-- Foto del Éxito (supabase/migraciones/2026-11-09_foto_exito.sql)
-- =====================================================================

-- ---------- Rol promotor: entra solo a la Foto del Éxito de su tienda ----------
alter table public.perfiles add column if not exists tienda_codigo text references public.tiendas (codigo);
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check check (rol in ('admin', 'registro', 'viewer', 'promotor'));

-- ---------- Datos de la tienda que pide el formato Entel ----------
alter table public.tiendas add column if not exists codigo_b2b    text;
alter table public.tiendas add column if not exists codigo_corto  text;
alter table public.tiendas add column if not exists cluster       text;
alter table public.tiendas add column if not exists merchandiser  text;

-- ---------- Productos que se revisan (editables por el admin) ----------
create table if not exists public.foto_productos (
  id         bigserial primary key,
  nombre     text not null check (length(btrim(nombre)) between 2 and 60),
  corto      text not null check (length(btrim(corto)) between 1 and 20),
  tipo       text not null check (tipo in ('Equipo', 'Accesorio')),
  orden      int  not null default 100,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists foto_productos_nombre on public.foto_productos (lower(btrim(nombre)));

-- ---------- Prioridades: equipos exigidos por cluster de tienda (K, A, B, C) y su número ----------
create table if not exists public.foto_prioridades (
  producto_id bigint not null references public.foto_productos (id) on delete cascade,
  cluster     text   not null check (cluster in ('K', 'A', 'B', 'C')),
  numero      int    not null check (numero between 1 and 999),
  primary key (producto_id, cluster)
);

-- ---------- Respuestas: una por tienda y semana ----------
create table if not exists public.foto_respuestas (
  id             bigserial primary key,
  semana         date not null check (extract(isodow from semana) = 1),   -- lunes
  tienda_codigo  text not null references public.tiendas (codigo),
  pedidos        bigint[] not null,          -- productos que se pidieron esa semana (foto de la lista)
  exhibidos      bigint[] not null default '{}',
  requeridos     bigint[] not null default '{}',   -- exigidos para el cluster de la tienda esa semana
  mesas          int[] not null default '{}' check (cardinality(mesas) <= 8),
  comentario     text not null default '' check (length(comentario) <= 500),
  creado_por     uuid references auth.users (id),
  actualizado_por uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (semana, tienda_codigo)
);
create index if not exists foto_respuestas_semana on public.foto_respuestas (semana desc);
alter table public.foto_respuestas add column if not exists requeridos bigint[] not null default '{}';

-- Lunes de la semana actual en Chile.
create or replace function public.semana_actual()
returns date
language sql stable set search_path = public
as $$
  select date_trunc('week', (now() at time zone 'America/Santiago'))::date;
$$;

-- ¿Puede el usuario actual llenar la foto de esta tienda?
create or replace function public.puede_llenar_foto(p_tienda text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.puede_registrar() or exists (
    select 1 from public.perfiles where id = auth.uid() and rol = 'promotor' and tienda_codigo = p_tienda
  );
$$;
revoke execute on function public.puede_llenar_foto(text) from public, anon;
grant execute on function public.puede_llenar_foto(text) to authenticated;

-- Guardar (o corregir) la foto de una tienda. El promotor solo la semana actual;
-- el equipo de zona también semanas pasadas.
create or replace function public.guardar_foto(
  p_tienda text, p_exhibidos bigint[], p_mesas int[], p_comentario text, p_semana date default null
)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_semana date := coalesce(p_semana, public.semana_actual());
  v_pedidos bigint[];
  v_requeridos bigint[];
  v_id bigint;
begin
  if not public.puede_llenar_foto(p_tienda) then
    raise exception 'No tienes permiso para llenar la Foto del Éxito de esta tienda';
  end if;
  if extract(isodow from v_semana) <> 1 then
    raise exception 'La semana debe empezar un lunes';
  end if;
  if v_semana > public.semana_actual() then
    raise exception 'No se puede llenar una semana futura';
  end if;
  if v_semana < public.semana_actual() and not public.puede_registrar() then
    raise exception 'Solo se puede llenar la semana actual';
  end if;
  if coalesce(cardinality(p_mesas), 0) > 8 then
    raise exception 'Máximo 8 mesas genéricas';
  end if;
  if exists (select 1 from unnest(coalesce(p_mesas, '{}')) m where m < 0 or m > 200) then
    raise exception 'Cada mesa debe tener entre 0 y 200 equipos';
  end if;

  -- Una corrección conserva la lista que se pidió esa semana; una respuesta nueva toma la lista activa.
  select pedidos into v_pedidos from public.foto_respuestas where semana = v_semana and tienda_codigo = p_tienda;
  if v_pedidos is null then
    select coalesce(array_agg(id order by orden, id), '{}') into v_pedidos from public.foto_productos where activo;
  end if;

  -- Exigidos: los de la prioridad del cluster de la tienda que están en la lista de esa semana.
  select coalesce(array_agg(pr.producto_id order by pr.numero), '{}') into v_requeridos
  from public.foto_prioridades pr join public.tiendas t on t.cluster = pr.cluster
  where t.codigo = p_tienda and pr.producto_id = any (v_pedidos);

  insert into public.foto_respuestas (semana, tienda_codigo, pedidos, requeridos, exhibidos, mesas, comentario, creado_por, actualizado_por)
  values (v_semana, p_tienda, v_pedidos, v_requeridos,
          array(select distinct x from unnest(coalesce(p_exhibidos, '{}')) x where x = any (v_pedidos)),
          coalesce(p_mesas, '{}'), left(btrim(coalesce(p_comentario, '')), 500), auth.uid(), auth.uid())
  on conflict (semana, tienda_codigo) do update set
    exhibidos = excluded.exhibidos, requeridos = excluded.requeridos, mesas = excluded.mesas, comentario = excluded.comentario,
    actualizado_por = auth.uid(), updated_at = now()
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.guardar_foto(text, bigint[], int[], text, date) from public, anon;
grant execute on function public.guardar_foto(text, bigint[], int[], text, date) to authenticated;

-- ---------- Permisos ----------
alter table public.foto_productos enable row level security;
alter table public.foto_respuestas enable row level security;

drop policy if exists "foto_productos leer" on public.foto_productos;
drop policy if exists "foto_productos admin" on public.foto_productos;
create policy "foto_productos leer" on public.foto_productos for select to authenticated using (true);
create policy "foto_productos admin" on public.foto_productos for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

alter table public.foto_prioridades enable row level security;
drop policy if exists "foto_prioridades leer" on public.foto_prioridades;
drop policy if exists "foto_prioridades admin" on public.foto_prioridades;
create policy "foto_prioridades leer" on public.foto_prioridades for select to authenticated using (true);
create policy "foto_prioridades admin" on public.foto_prioridades for all to authenticated
  using (public.es_admin()) with check (public.es_admin());
grant select, insert, update, delete on public.foto_prioridades to authenticated;

-- Leer: el equipo ve todo; el promotor solo su tienda. Escribir: solo con guardar_foto.
drop policy if exists "foto_respuestas leer" on public.foto_respuestas;
create policy "foto_respuestas leer" on public.foto_respuestas for select to authenticated
  using (not exists (select 1 from public.perfiles where id = auth.uid() and rol = 'promotor')
         or public.puede_llenar_foto(tienda_codigo));

grant select, insert, update, delete on public.foto_productos to authenticated;
grant select on public.foto_respuestas to authenticated;
grant usage on sequence public.foto_productos_id_seq to authenticated;

-- ---------- Datos de ejemplo ----------
-- Los productos, prioridades y codigos de tienda de ejemplo estan en supabase/seed.sql (datos ficticios).

-- ---------- El promotor no ve datos del resto de la web ----------
create or replace function public.es_promotor()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'promotor');
$$;
revoke execute on function public.es_promotor() from public, anon;
grant execute on function public.es_promotor() to authenticated;

alter policy "cargas leer" on public.cargas using (not public.es_promotor());
alter policy "mediciones leer" on public.mediciones using (not public.es_promotor());
alter policy "acciones leer" on public.acciones using (not public.es_promotor());
alter policy "ejecutivos leer" on public.ejecutivos using (not public.es_promotor());


-- =====================================================================
-- Foto del Éxito: copia semanal de prioridades (supabase/migraciones/2026-11-09_foto_snapshot.sql)
-- =====================================================================

create table if not exists public.foto_semanas (
  semana      date primary key check (extract(isodow from semana) = 1),
  prioridades jsonb not null default '[]'::jsonb,   -- [{producto_id, cluster, numero}]
  updated_at  timestamptz not null default now()
);

-- Copia las prioridades vigentes a una semana. Las pasadas no se tocan si ya tienen copia.
create or replace function public.congelar_semana(p_semana date)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_prio jsonb := coalesce((select jsonb_agg(jsonb_build_object('producto_id', producto_id, 'cluster', cluster, 'numero', numero)
                                             order by cluster, numero) from public.foto_prioridades), '[]'::jsonb);
begin
  if p_semana >= public.semana_actual() then
    insert into public.foto_semanas (semana, prioridades) values (p_semana, v_prio)
    on conflict (semana) do update set prioridades = excluded.prioridades, updated_at = now();
  else
    insert into public.foto_semanas (semana, prioridades) values (p_semana, v_prio)
    on conflict (semana) do nothing;
  end if;
end $$;
revoke execute on function public.congelar_semana(date) from public, anon, authenticated;

-- Cada cambio en la tabla de prioridades actualiza la copia de la semana actual.
create or replace function public.foto_prioridades_cambio()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.congelar_semana(public.semana_actual());
  return null;
end $$;
revoke execute on function public.foto_prioridades_cambio() from public, anon, authenticated;

drop trigger if exists foto_prioridades_copia on public.foto_prioridades;
create trigger foto_prioridades_copia after insert or update or delete on public.foto_prioridades
  for each statement execute function public.foto_prioridades_cambio();

-- Guardar: los exigidos salen de la copia de esa semana (no de la tabla de hoy).
create or replace function public.guardar_foto(
  p_tienda text, p_exhibidos bigint[], p_mesas int[], p_comentario text, p_semana date default null
)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_semana date := coalesce(p_semana, public.semana_actual());
  v_pedidos bigint[];
  v_requeridos bigint[];
  v_id bigint;
begin
  if not public.puede_llenar_foto(p_tienda) then
    raise exception 'No tienes permiso para llenar la Foto del Éxito de esta tienda';
  end if;
  if extract(isodow from v_semana) <> 1 then
    raise exception 'La semana debe empezar un lunes';
  end if;
  if v_semana > public.semana_actual() then
    raise exception 'No se puede llenar una semana futura';
  end if;
  if v_semana < public.semana_actual() and not public.puede_registrar() then
    raise exception 'Solo se puede llenar la semana actual';
  end if;
  if coalesce(cardinality(p_mesas), 0) > 8 then
    raise exception 'Máximo 8 mesas genéricas';
  end if;
  if exists (select 1 from unnest(coalesce(p_mesas, '{}')) m where m < 0 or m > 200) then
    raise exception 'Cada mesa debe tener entre 0 y 200 equipos';
  end if;

  perform public.congelar_semana(v_semana);

  select pedidos into v_pedidos from public.foto_respuestas where semana = v_semana and tienda_codigo = p_tienda;
  if v_pedidos is null then
    select coalesce(array_agg(id order by orden, id), '{}') into v_pedidos from public.foto_productos where activo;
  end if;

  select coalesce(array_agg((x ->> 'producto_id')::bigint order by (x ->> 'numero')::int), '{}') into v_requeridos
  from public.foto_semanas s, jsonb_array_elements(s.prioridades) x, public.tiendas t
  where s.semana = v_semana and t.codigo = p_tienda and x ->> 'cluster' = t.cluster
    and (x ->> 'producto_id')::bigint = any (v_pedidos);

  insert into public.foto_respuestas (semana, tienda_codigo, pedidos, requeridos, exhibidos, mesas, comentario, creado_por, actualizado_por)
  values (v_semana, p_tienda, v_pedidos, v_requeridos,
          array(select distinct x from unnest(coalesce(p_exhibidos, '{}')) x where x = any (v_pedidos)),
          coalesce(p_mesas, '{}'), left(btrim(coalesce(p_comentario, '')), 500), auth.uid(), auth.uid())
  on conflict (semana, tienda_codigo) do update set
    exhibidos = excluded.exhibidos, requeridos = excluded.requeridos, mesas = excluded.mesas, comentario = excluded.comentario,
    actualizado_por = auth.uid(), updated_at = now()
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.guardar_foto(text, bigint[], int[], text, date) from public, anon;
grant execute on function public.guardar_foto(text, bigint[], int[], text, date) to authenticated;

-- Foto del Éxito: que dos personas no se pisen al corregir la misma tienda y semana.
--
-- Bloqueo optimista: el formulario manda la fecha de la última actualización que vio (p_version).
-- Si en la base hay otra, alguien guardó entremedio y la función avisa con el código 40001 en vez
-- de sobrescribir. Quien llena puede recargar o decidir reemplazar (p_comprobar = false).
--
-- Es compatible con la versión que está en producción: sin p_comprobar se comporta igual que antes.
-- Ahora devuelve id y updated_at, para que la pantalla tenga la versión nueva sin recargar.

drop function if exists public.guardar_foto(text, bigint[], int[], text, date);

create or replace function public.guardar_foto(
  p_tienda text, p_exhibidos bigint[], p_mesas int[], p_comentario text, p_semana date default null,
  p_version timestamptz default null, p_comprobar boolean default false
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_semana date := coalesce(p_semana, public.semana_actual());
  v_pedidos bigint[];
  v_requeridos bigint[];
  v_actual timestamptz;
  v_por text;
  v_fila public.foto_respuestas%rowtype;
begin
  if not public.puede_llenar_foto(p_tienda) then
    raise exception 'No tienes permiso para llenar la Foto del Éxito de esta tienda';
  end if;
  if extract(isodow from v_semana) <> 1 then
    raise exception 'La semana debe empezar un lunes';
  end if;
  if v_semana > public.semana_actual() then
    raise exception 'No se puede llenar una semana futura';
  end if;
  if v_semana < public.semana_actual() and not public.puede_registrar() then
    raise exception 'Solo se puede llenar la semana actual';
  end if;
  if coalesce(cardinality(p_mesas), 0) > 8 then
    raise exception 'Máximo 8 mesas genéricas';
  end if;
  if exists (select 1 from unnest(coalesce(p_mesas, '{}')) m where m < 0 or m > 200) then
    raise exception 'Cada mesa debe tener entre 0 y 200 equipos';
  end if;

  -- Un guardado a la vez por tienda y semana: el segundo espera y después compara versiones.
  perform pg_advisory_xact_lock(hashtext('foto|' || p_tienda || '|' || v_semana::text));

  select r.updated_at, coalesce(p.nombre, 'otra persona') into v_actual, v_por
  from public.foto_respuestas r left join public.perfiles p on p.id = r.actualizado_por
  where r.semana = v_semana and r.tienda_codigo = p_tienda;

  if p_comprobar and v_actual is distinct from p_version then
    raise exception using
      errcode = '40001',
      message = format('%s guardó esta tienda mientras la llenabas', v_por),
      hint = to_char(v_actual at time zone 'America/Santiago', 'DD-MM HH24:MI');
  end if;

  perform public.congelar_semana(v_semana);

  -- Una corrección conserva la lista que se pidió esa semana; una respuesta nueva toma la lista activa.
  select pedidos into v_pedidos from public.foto_respuestas where semana = v_semana and tienda_codigo = p_tienda;
  if v_pedidos is null then
    select coalesce(array_agg(id order by orden, id), '{}') into v_pedidos from public.foto_productos where activo;
  end if;

  -- Exigidos: los de la copia de prioridades de esa semana para el cluster de la tienda.
  select coalesce(array_agg((x ->> 'producto_id')::bigint order by (x ->> 'numero')::int), '{}') into v_requeridos
  from public.foto_semanas s, jsonb_array_elements(s.prioridades) x, public.tiendas t
  where s.semana = v_semana and t.codigo = p_tienda and x ->> 'cluster' = t.cluster
    and (x ->> 'producto_id')::bigint = any (v_pedidos);

  insert into public.foto_respuestas (semana, tienda_codigo, pedidos, requeridos, exhibidos, mesas, comentario, creado_por, actualizado_por)
  values (v_semana, p_tienda, v_pedidos, v_requeridos,
          array(select distinct x from unnest(coalesce(p_exhibidos, '{}')) x where x = any (v_pedidos)),
          coalesce(p_mesas, '{}'), left(btrim(coalesce(p_comentario, '')), 500), auth.uid(), auth.uid())
  on conflict (semana, tienda_codigo) do update set
    exhibidos = excluded.exhibidos, requeridos = excluded.requeridos, mesas = excluded.mesas, comentario = excluded.comentario,
    -- clock_timestamp y no now(): dos guardados en la misma transacción no deben quedar con la misma versión.
    actualizado_por = auth.uid(), updated_at = clock_timestamp()
  returning * into v_fila;

  return jsonb_build_object('id', v_fila.id, 'updated_at', v_fila.updated_at, 'pedidos', v_fila.pedidos, 'requeridos', v_fila.requeridos);
end $$;
revoke execute on function public.guardar_foto(text, bigint[], int[], text, date, timestamptz, boolean) from public, anon;
grant execute on function public.guardar_foto(text, bigint[], int[], text, date, timestamptz, boolean) to authenticated;

alter table public.foto_semanas enable row level security;
drop policy if exists "foto_semanas leer" on public.foto_semanas;
create policy "foto_semanas leer" on public.foto_semanas for select to authenticated using (true);
grant select on public.foto_semanas to authenticated;

-- Copias iniciales: las semanas que ya tienen respuestas y la actual.
insert into public.foto_semanas (semana, prioridades)
select s.semana, coalesce((select jsonb_agg(jsonb_build_object('producto_id', producto_id, 'cluster', cluster, 'numero', numero)
                                            order by cluster, numero) from public.foto_prioridades), '[]'::jsonb)
from (select distinct semana from public.foto_respuestas union select public.semana_actual()) s
on conflict (semana) do nothing;
-- =====================================================================
-- Foto del Éxito: un producto solo se puede eliminar si ninguna respuesta lo usa.
-- Si ya se usó, se oculta (activo = false) para no romper el historial.
-- Idempotente: se puede ejecutar más de una vez.
-- =====================================================================

create or replace function public.foto_producto_borrar()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.foto_respuestas r where old.id = any (r.pedidos)) then
    raise exception 'Este producto ya está en respuestas enviadas: ocúltalo en vez de eliminarlo';
  end if;
  return old;
end $$;
revoke execute on function public.foto_producto_borrar() from public, anon, authenticated;

drop trigger if exists foto_producto_borrar on public.foto_productos;
create trigger foto_producto_borrar before delete on public.foto_productos
  for each row execute function public.foto_producto_borrar();
