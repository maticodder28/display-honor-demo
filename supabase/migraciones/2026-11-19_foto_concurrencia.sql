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
