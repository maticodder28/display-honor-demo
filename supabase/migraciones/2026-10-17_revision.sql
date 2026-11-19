-- =====================================================================
-- Ajustes de la revisión del 17-10-2026.
-- 1. Bitácora: la base rechaza fechas futuras y montos absurdos (no solo la página).
-- 2. Publicar: un Excel con fecha de corte antigua no sobrescribe los datos actuales de las tiendas.
-- Idempotente: se puede ejecutar más de una vez.
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

