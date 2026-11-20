'use server';
// Server actions: lo único que puede llamar la pantalla para escribir. Cada una delega en su caso de uso;
// la pantalla nunca sabe si detrás hay Supabase o la demo.
import type { Publicacion } from '@/aplicacion/puertos';
import { contenedor } from '@/infraestructura/contenedor';

export async function publicarCarga(p: Publicacion) {
  return contenedor().display.publicar(p);
}
