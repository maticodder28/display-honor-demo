-- =====================================================================
-- Ejecutivos: dar de baja y reactivar (rotación, renuncias, despidos).
-- No se borran: sus ventas e incentivos pasados siguen en el historial y los reportes.
-- Idempotente: se puede ejecutar más de una vez.
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
