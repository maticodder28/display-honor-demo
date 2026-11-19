-- =====================================================================
-- Foto del Éxito: copia semanal de las prioridades por cluster.
-- La semana actual sigue los cambios de la tabla; las semanas pasadas quedan congeladas.
-- Los Excel y las correcciones de semanas pasadas usan los números de su semana.
-- Idempotente: se puede ejecutar más de una vez.
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
