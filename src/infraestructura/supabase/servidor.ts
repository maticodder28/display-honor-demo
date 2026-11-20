import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/** Cliente de Supabase con la sesión del usuario (cookies), así la base aplica sus permisos (RLS). */
export async function crearClienteServidor() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Desde un Server Component no se pueden escribir cookies; el middleware ya refresca la sesión.
        }
      },
    },
  });
}

export type ClienteSupabase = Awaited<ReturnType<typeof crearClienteServidor>>;
