import type { RepositorioBitacora } from '@/aplicacion/puertos';
import type { BitAccion, BitEjecutivo, BitPerfil, BitTienda } from '@/dominio/bitacora/bitacora';
import { exito, fallo, vacio } from '@/dominio/comun/resultado';
import type { ClienteSupabase } from '../servidor';
import { aFalla, idZona } from './comun';

const COLUMNAS_ACCION = 'id, tienda_codigo, fecha, tipo, ejecutivo_id, detalle, unidades, costo, pendiente, hecho, creado_por, created_at';
const COLUMNAS_EJECUTIVO = 'id, tienda_codigo, nombre, activo';
/** Supabase entrega como máximo 1.000 filas por consulta. */
const PAGINA = 1000;

export function repositorioBitacoraSupabase(db: () => Promise<ClienteSupabase>, zona: string): RepositorioBitacora {
  return {
    async datos() {
      const cliente = await db();
      const z = await idZona(cliente, zona);
      if (z == null) return { tiendas: [], ejecutivos: [], acciones: [], perfiles: [] };
      const { data: tiendas, error: e1 } = await cliente
        .from('tiendas').select('codigo, nombre, cliente, ciudad, cobertura')
        .eq('zona_id', z).eq('activa', true).order('nombre');
      if (e1) throw new Error(`No se pudo cargar la bitácora: ${e1.message}`);
      const codigos = (tiendas ?? []).map((t) => t.codigo);
      const desde = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);

      // Con un año de registros se pasan las 1.000 filas, así que las acciones van por páginas.
      const traerAcciones = async () => {
        const todas: BitAccion[] = [];
        for (let inicio = 0; ; inicio += PAGINA) {
          const { data, error } = await cliente.from('acciones').select(COLUMNAS_ACCION)
            .in('tienda_codigo', codigos).gte('fecha', desde)
            .order('fecha', { ascending: false }).order('id', { ascending: false })
            .range(inicio, inicio + PAGINA - 1);
          if (error) return { data: null, error };
          todas.push(...((data ?? []) as BitAccion[]));
          if (!data || data.length < PAGINA) return { data: todas, error: null };
        }
      };
      const [ej, ac, pf] = await Promise.all([
        // Incluye a los dados de baja: sus ventas e incentivos pasados siguen en el historial y los reportes.
        cliente.from('ejecutivos').select(COLUMNAS_EJECUTIVO).in('tienda_codigo', codigos).order('nombre'),
        traerAcciones(),
        cliente.from('perfiles').select('id, nombre, cargo'),
      ]);
      const err = ej.error || ac.error || pf.error;
      if (err) throw new Error(`No se pudo cargar la bitácora: ${err.message}`);
      return {
        tiendas: (tiendas ?? []) as BitTienda[],
        ejecutivos: (ej.data ?? []) as BitEjecutivo[],
        acciones: (ac.data ?? []) as BitAccion[],
        perfiles: (pf.data ?? []) as BitPerfil[],
      };
    },

    // El autor (creado_por) lo pone la base con auth.uid(): nadie puede registrar a nombre de otro.
    async registrar(a) {
      const { data, error } = await (await db()).from('acciones').insert(a).select(COLUMNAS_ACCION).single();
      return error || !data ? aFalla(error ?? { message: 'error desconocido' }, 'No se pudo guardar') : exito(data as BitAccion);
    },

    async agregarEjecutivo(tienda, nombre) {
      const { data, error } = await (await db()).from('ejecutivos').insert({ tienda_codigo: tienda, nombre }).select(COLUMNAS_EJECUTIVO).single();
      return error || !data ? aFalla(error ?? { message: 'error desconocido' }, 'No se pudo agregar') : exito(data as BitEjecutivo);
    },

    async cambiarEstadoEjecutivo(id, activo) {
      const { error } = await (await db()).rpc('cambiar_estado_ejecutivo', { p_id: id, p_activo: activo });
      return error ? aFalla(error, 'No se pudo actualizar') : vacio();
    },

    async marcarPendiente(id, hecho) {
      const { error } = await (await db()).rpc('marcar_pendiente', { p_id: id, p_hecho: hecho });
      return error ? aFalla(error, 'No se pudo actualizar') : vacio();
    },

    // Si RLS no deja borrar (registro de otra persona), Supabase no da error: borra 0 filas. Por eso cuento.
    async eliminar(id) {
      const { error, count } = await (await db()).from('acciones').delete({ count: 'exact' }).eq('id', id);
      return error || !count ? fallo('otro', 'No se pudo eliminar el registro.') : vacio();
    },
  };
}
