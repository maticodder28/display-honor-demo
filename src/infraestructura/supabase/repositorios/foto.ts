import type { RepositorioFoto } from '@/aplicacion/puertos';
import type { BitPerfil } from '@/dominio/bitacora/bitacora';
import { exito, vacio } from '@/dominio/comun/resultado';
import { FOTO_CLIENTE, type FotoGuardada, type FotoPrioridad, type FotoProducto, type FotoRespuesta, type FotoSemana, type FotoTienda } from '@/dominio/foto/foto';
import type { ClienteSupabase } from '../servidor';
import { aFalla, idZona } from './comun';

const COLUMNAS_PRODUCTO = 'id, nombre, corto, tipo, orden, activo';

export function repositorioFotoSupabase(db: () => Promise<ClienteSupabase>, zona: string): RepositorioFoto {
  return {
    async datos(desde) {
      const cliente = await db();
      const z = await idZona(cliente, zona);
      if (z == null) return { productos: [], prioridades: [], semanasPrio: [], tiendas: [], respuestas: [], perfiles: [] };
      const [pr, pz, ps, ti, re, pf] = await Promise.all([
        cliente.from('foto_productos').select(COLUMNAS_PRODUCTO).order('orden').order('id'),
        cliente.from('foto_prioridades').select('producto_id, cluster, numero'),
        cliente.from('foto_semanas').select('semana, prioridades').gte('semana', desde),
        cliente.from('tiendas')
          .select('codigo, tienda:nombre, ciudad, cobertura, codigo_b2b, codigo_corto, cluster, merchandiser')
          .eq('zona_id', z).eq('activa', true).ilike('cliente', FOTO_CLIENTE).order('ciudad').order('nombre'),
        cliente.from('foto_respuestas')
          .select('id, semana, tienda_codigo, pedidos, requeridos, exhibidos, mesas, comentario, actualizado_por, updated_at')
          .gte('semana', desde).order('semana', { ascending: false }).limit(1000),
        cliente.from('perfiles').select('id, nombre, cargo'),
      ]);
      const err = pr.error || pz.error || ps.error || ti.error || re.error || pf.error;
      if (err) throw new Error(`No se pudo cargar la Foto del Éxito: ${err.message}`);
      return {
        productos: (pr.data ?? []) as FotoProducto[],
        prioridades: (pz.data ?? []) as FotoPrioridad[],
        semanasPrio: (ps.data ?? []) as FotoSemana[],
        tiendas: (ti.data ?? []) as FotoTienda[],
        respuestas: (re.data ?? []) as FotoRespuesta[],
        perfiles: (pf.data ?? []) as BitPerfil[],
      };
    },

    // guardar_foto calcula en la base los pedidos y exigidos de la semana, así no dependen del navegador,
    // y compara la versión para no pisar lo que otra persona guardó mientras tanto.
    async guardar(e) {
      const { data, error } = await (await db()).rpc('guardar_foto', {
        p_tienda: e.tienda, p_exhibidos: e.exhibidos, p_mesas: e.mesas, p_comentario: e.comentario, p_semana: e.semana,
        p_version: e.version, p_comprobar: !e.reemplazar,
      });
      return error || !data ? aFalla(error ?? { message: 'error desconocido' }, 'No se pudo enviar') : exito(data as FotoGuardada);
    },

    async crearProducto(p) {
      const { data, error } = await (await db()).from('foto_productos').insert(p).select(COLUMNAS_PRODUCTO).single();
      return error || !data ? aFalla(error ?? { message: 'error desconocido' }, 'No se pudo agregar') : exito(data as FotoProducto);
    },

    async editarProducto(id, p) {
      const { error } = await (await db()).from('foto_productos').update(p).eq('id', id);
      return error ? aFalla(error, 'No se pudo guardar') : vacio();
    },

    async activarProducto(id, activo) {
      const { error } = await (await db()).from('foto_productos').update({ activo }).eq('id', id);
      return error ? aFalla(error, 'No se pudo actualizar') : vacio();
    },

    async eliminarProducto(id) {
      const { error } = await (await db()).from('foto_productos').delete().eq('id', id);
      return error ? aFalla(error, 'No se pudo eliminar') : vacio();
    },

    async fijarPrioridad(productoId, cluster, numero) {
      const cliente = await db();
      const { error } = numero == null
        ? await cliente.from('foto_prioridades').delete().eq('producto_id', productoId).eq('cluster', cluster)
        : await cliente.from('foto_prioridades').upsert({ producto_id: productoId, cluster, numero });
      return error ? aFalla(error, 'No se pudo guardar') : vacio();
    },
  };
}
