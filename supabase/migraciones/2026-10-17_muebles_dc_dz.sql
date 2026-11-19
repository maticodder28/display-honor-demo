-- Separa Muebles en dos categorías: DC y DZ.
-- Los muebles cargados antes de este cambio no tenían categoría y pasan a DC.
-- Idempotente: se puede ejecutar más de una vez.

alter table public.mediciones drop constraint if exists mediciones_metrica_check;

update public.mediciones set metrica = 'muebles_dc' where metrica = 'muebles';

alter table public.mediciones add constraint mediciones_metrica_check
  check (metrica in ('exhibiciones', 'muebles_dc', 'muebles_dz', 'promotores'));
