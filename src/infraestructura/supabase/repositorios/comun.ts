import { fallo, type CodigoFalla, type Resultado } from '@/dominio/comun/resultado';
import type { ClienteSupabase } from '../servidor';

/** Id de la zona configurada, o null si todavía no existe en la base. */
export async function idZona(db: ClienteSupabase, zona: string): Promise<number | null> {
  const { data } = await db.from('zonas').select('id').eq('nombre', zona).maybeSingle();
  return (data?.id as number | undefined) ?? null;
}

/**
 * Traduce un error de Postgres a una falla de la app. 23505 es "ya existe" (índice único) y los
 * triggers que protegen productos ya usados avisan con un mensaje que dice "ocúltalo".
 */
export function aFalla<T = never>(error: { code?: string; message: string; hint?: string | null }, prefijo: string): Resultado<T> {
  // 40001 lo usa guardar_foto cuando otra persona guardó entremedio; el mensaje ya viene listo para mostrar.
  if (error.code === '40001') return fallo('conflicto', `${error.message}${error.hint ? ` (${error.hint})` : ''}.`);
  const codigo: CodigoFalla = error.code === '23505' ? 'duplicado' : /ocúltalo/.test(error.message) ? 'en_uso' : 'otro';
  return fallo(codigo, `${prefijo}: ${error.message}`);
}
