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
