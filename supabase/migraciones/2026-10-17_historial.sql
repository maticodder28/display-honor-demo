-- =====================================================================
-- Historial por fecha de corte.
-- Cada carga (Excel subido) es una foto completa con su fecha de corte.
-- Subir otra carga con la misma fecha reemplaza la anterior.
-- Idempotente: se puede ejecutar más de una vez.
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
