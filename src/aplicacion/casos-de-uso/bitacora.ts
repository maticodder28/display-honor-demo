import { validarAccion, type BitAccion, type BitEjecutivo, type NuevaAccion } from '@/dominio/bitacora/bitacora';
import { fallo, type Resultado } from '@/dominio/comun/resultado';
import type { RepositorioBitacora, ServicioSesion } from '../puertos';

interface Dependencias { repo: RepositorioBitacora; sesion: ServicioSesion; hoy: () => string }

const SIN_PERMISO = 'Tu usuario no puede registrar en la bitácora.';

/**
 * Casos de uso de la bitácora. Cada escritura revisa el permiso y valida de nuevo en el servidor:
 * la pantalla también valida, pero eso es para avisar rápido, no para confiar en lo que llega.
 */
export function crearCasosBitacora({ repo, sesion, hoy }: Dependencias) {
  async function conPermiso<T>(fn: () => Promise<Resultado<T>>): Promise<Resultado<T>> {
    const u = await sesion.usuarioActual();
    return u?.puedeRegistrar ? fn() : fallo('sin_permiso', SIN_PERMISO);
  }

  return {
    datos: () => repo.datos(),

    registrar: (a: NuevaAccion): Promise<Resultado<BitAccion>> =>
      conPermiso(async () => {
        const error = validarAccion(a, hoy());
        return error ? fallo('invalido', error) : repo.registrar({ ...a, detalle: a.detalle.trim() });
      }),

    agregarEjecutivo: (tienda: string, nombre: string): Promise<Resultado<BitEjecutivo>> =>
      conPermiso(async () => {
        const limpio = nombre.trim();
        if (limpio.length < 2 || limpio.length > 80) return fallo('invalido', 'Escribe el nombre del ejecutivo (2 a 80 letras).');
        return repo.agregarEjecutivo(tienda, limpio);
      }),

    cambiarEstadoEjecutivo: (id: number, activo: boolean) => conPermiso(() => repo.cambiarEstadoEjecutivo(id, activo)),
    marcarPendiente: (id: number, hecho: boolean) => conPermiso(() => repo.marcarPendiente(id, hecho)),
    // Si el registro es de otra persona y no soy admin, la base no lo borra y el repositorio lo informa.
    eliminar: (id: number) => conPermiso(() => repo.eliminar(id)),
  };
}
