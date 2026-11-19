'use client';
import { createBrowserClient } from '@supabase/ssr';
import { DEMO, MENSAJE_DEMO } from '@/lib/modo';

/**
 * En modo demo no hay base de datos: cualquier consulta encadenada (from().insert().select()...)
 * termina en un error con el aviso de demo, que cada pantalla ya sabe mostrar.
 */
function clienteDemo(): ReturnType<typeof createBrowserClient> {
  const resultado = { data: null, error: { message: MENSAJE_DEMO }, count: null, status: 0, statusText: 'demo' };
  const cadena: object = new Proxy(function () {}, {
    get: (_t, prop) => (prop === 'then' ? (ok: (v: typeof resultado) => unknown) => Promise.resolve(resultado).then(ok) : cadena),
    apply: () => cadena,
  });
  return cadena as ReturnType<typeof createBrowserClient>;
}

export function createClient() {
  if (DEMO) return clienteDemo();
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
