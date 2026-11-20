import { destinoSeguro } from '@/dominio/usuario';
import type { ServicioSesion } from '../puertos';

export type ErrorLogin = 'credenciales' | 'otro';

export function crearCasosSesion(sesion: ServicioSesion) {
  return {
    usuarioActual: () => sesion.usuarioActual(),
    cerrar: () => sesion.cerrar(),

    /** Devuelve a dónde ir después de entrar, o el tipo de error para mostrar en el login. */
    async iniciar(email: string, password: string, next: string): Promise<{ ok: true; destino: string } | { ok: false; error: ErrorLogin; destino: string }> {
      const destino = destinoSeguro(next);
      const r = await sesion.iniciar(email.trim(), password);
      if (r.ok) return { ok: true, destino };
      return { ok: false, error: r.falla.codigo === 'invalido' ? 'credenciales' : 'otro', destino };
    },
  };
}
