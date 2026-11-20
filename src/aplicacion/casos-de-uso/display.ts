import { esFechaIso } from '@/dominio/comun/fechas';
import { fdate } from '@/dominio/comun/formato';
import { fallo, type Resultado } from '@/dominio/comun/resultado';
import type { Publicacion, RepositorioDisplay, ServicioSesion } from '../puertos';

interface Dependencias { repo: RepositorioDisplay; sesion: ServicioSesion; hoy: () => string }

/** Dashboard, historial y publicación de cortes. */
export function crearCasosDisplay({ repo, sesion, hoy }: Dependencias) {
  return {
    corteActual: () => repo.corteActual(),
    historial: () => repo.historial(),

    /** Todo lo que muestra Admin: el corte actual (para descargarlo), los últimos 15 cortes y sus fechas. */
    async panelAdmin() {
      const [actual, cargas, fechas] = await Promise.all([repo.corteActual(), repo.cargas(15), repo.fechasDeCorte()]);
      return { actual, cargas, fechas };
    },

    async publicar(p: Publicacion): Promise<Resultado> {
      const u = await sesion.usuarioActual();
      if (!u?.esAdmin) return fallo('sin_permiso', 'Solo un administrador puede publicar datos.');
      if (!esFechaIso(p.fechaCorte) || p.fechaCorte > hoy()) return fallo('invalido', 'Elige una fecha de corte válida (hoy o antes).');
      if (!p.datos?.tiendas?.length || !p.datos.marcas?.length) return fallo('invalido', 'El archivo no trae tiendas o marcas.');
      // Reviso las fechas ahora y no con la lista que se cargó con la página: otro admin pudo publicar entremedio.
      if (!p.reemplazar && (await repo.fechasDeCorte()).includes(p.fechaCorte))
        return fallo('conflicto', `Ya hay un corte con fecha ${fdate(p.fechaCorte)}.`);
      return repo.publicar(p);
    },
  };
}
