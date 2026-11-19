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
