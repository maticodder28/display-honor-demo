import 'server-only';
import { redirect } from 'next/navigation';
import type { Acceso } from '@/aplicacion/casos-de-uso/acceso';

/** Convierte la decisión del caso de uso en la redirección de Next. Si hay acceso, devuelve usuario y datos. */
export function exigirAcceso<T>(a: Acceso<T>, ruta: string) {
  if (a.tipo === 'login') redirect(ruta === '/' ? '/login' : `/login?next=${ruta}`);
  if (a.tipo === 'redirigir') redirect(a.a);
  return a;
}
