import { fallo, type Resultado } from '@/dominio/comun/resultado';
import {
  CLUSTERS, acotarMesa, lunesDe, normalizarProducto, sumarDias, validarEnvio, type DatosProducto, type EnvioFoto, type FotoProducto,
} from '@/dominio/foto/foto';
import { puedeLlenarFoto } from '@/dominio/usuario';
import type { RepositorioFoto, ServicioSesion } from '../puertos';

interface Dependencias { repo: RepositorioFoto; sesion: ServicioSesion; hoy: () => string }

/** Semanas de historia que carga la pantalla (medio año). */
const SEMANAS_DE_HISTORIA = 26;

export function crearCasosFoto({ repo, sesion, hoy }: Dependencias) {
  const semanaActual = () => lunesDe(hoy());

  async function soloAdmin<T>(fn: () => Promise<Resultado<T>>): Promise<Resultado<T>> {
    const u = await sesion.usuarioActual();
    return u?.esAdmin ? fn() : fallo('sin_permiso', 'Solo un administrador puede cambiar los productos.');
  }

  return {
    semanaActual,
    datos: () => repo.datos(sumarDias(semanaActual(), -7 * (SEMANAS_DE_HISTORIA - 1))),

    async guardar(e: EnvioFoto): Promise<Resultado> {
      const u = await sesion.usuarioActual();
      if (!u || !puedeLlenarFoto(u, e.tienda)) return fallo('sin_permiso', 'Tu usuario no puede llenar esta tienda.');
      if (u.esPromotor && e.semana !== semanaActual()) return fallo('sin_permiso', 'El promotor solo llena la semana actual.');
      const error = validarEnvio(e, semanaActual());
      if (error) return fallo('invalido', error);
      return repo.guardar({ ...e, mesas: e.mesas.map(acotarMesa), comentario: e.comentario.trim() });
    },

    crearProducto: (p: DatosProducto, orden: number): Promise<Resultado<FotoProducto>> =>
      soloAdmin(async () => {
        const n = normalizarProducto(p);
        return typeof n === 'string' ? fallo('invalido', n) : repo.crearProducto({ ...n, orden });
      }),

    editarProducto: (id: number, p: DatosProducto) =>
      soloAdmin(async () => {
        const n = normalizarProducto(p);
        return typeof n === 'string' ? fallo('invalido', n) : repo.editarProducto(id, n);
      }),

    activarProducto: (id: number, activo: boolean) => soloAdmin(() => repo.activarProducto(id, activo)),
    eliminarProducto: (id: number) => soloAdmin(() => repo.eliminarProducto(id)),

    fijarPrioridad: (productoId: number, cluster: string, numero: number | null) =>
      soloAdmin(async () => {
        if (!(CLUSTERS as readonly string[]).includes(cluster)) return fallo('invalido', 'Cluster desconocido.');
        if (numero != null && !(Number.isInteger(numero) && numero >= 1 && numero <= 999))
          return fallo('invalido', 'El número debe estar entre 1 y 999, o vacío si no se exige.');
        return repo.fijarPrioridad(productoId, cluster, numero);
      }),
  };
}
