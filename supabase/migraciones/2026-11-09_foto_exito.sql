-- =====================================================================
-- Foto del Éxito: checklist semanal de exhibición por tienda (Entel).
-- Los promotores llenan su tienda; las tiendas Middle Management las llena el equipo de zona.
-- Semana = lunes a domingo (hora de Chile). Una respuesta por tienda y semana; se puede corregir.
-- Idempotente: se puede ejecutar más de una vez.
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

