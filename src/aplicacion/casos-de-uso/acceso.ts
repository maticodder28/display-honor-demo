import { puedeVer, type Usuario, type Vista } from '@/dominio/usuario';
import type { ServicioSesion } from '../puertos';

export type Acceso<T> = { tipo: 'login' } | { tipo: 'redirigir'; a: string } | { tipo: 'ok'; usuario: Usuario; datos: T };

export function crearAcceso(sesion: ServicioSesion) {
  /**
   * Revisa la sesión y carga los datos de una vista. La consulta parte en paralelo con la sesión
   * (los permisos los aplica la base igual), así la página no espera dos viajes seguidos a Supabase.
   */
  return async function cargarVista<T>(vista: Vista, cargar: () => Promise<T>): Promise<Acceso<T>> {
    const pedido = cargar();
    // Si falla antes de esperarla (por ejemplo, sin sesión), el error no puede cortar la redirección al login.
    pedido.catch(() => {});
    const usuario = await sesion.usuarioActual();
    if (!usuario) return { tipo: 'login' };
    if (!puedeVer(usuario, vista)) return { tipo: 'redirigir', a: '/foto' };
    return { tipo: 'ok', usuario, datos: await pedido };
  };
}
