// Puertos: lo que los casos de uso necesitan del mundo exterior, escrito como interfaces.
// Hay dos implementaciones de cada repositorio (Supabase y demo) en infraestructura/, y los casos
// de uso no saben cuál les tocó. Eso es lo que permite probarlos con repositorios falsos.

import type { BitAccion, BitEjecutivo, DatosBitacora, NuevaAccion } from '@/dominio/bitacora/bitacora';
import type { Resultado } from '@/dominio/comun/resultado';
import type { FalloLLM, MensajeChat } from '@/dominio/asistente/agente';
import type { Historial } from '@/dominio/display/historial';
import type { CargaInfo, DatosCarga } from '@/dominio/display/modelo';
import type { DatosProducto, EnvioFoto, FotoDatos, FotoGuardada, FotoProducto } from '@/dominio/foto/foto';
import type { Usuario } from '@/dominio/usuario';

export interface CorteActual { raw: DatosCarga; carga: CargaInfo }

/** Fila del listado de cortes en Admin. */
export interface CargaPublicada {
  id: number;
  fecha_corte: string;
  archivo: string | null;
  created_at: string;
  resumen: Record<string, string>;
  por_nombre: string | null;
}

/** `reemplazar`: quien publica ya confirmó que se reemplaza el corte de esa fecha si existe. */
export interface Publicacion { datos: DatosCarga; archivo: string; fechaCorte: string; reemplazar: boolean }

export interface RepositorioDisplay {
  /** Corte más reciente de la zona, o null si todavía no se sube ninguno. */
  corteActual(): Promise<CorteActual | null>;
  historial(): Promise<Historial>;
  cargas(limite: number): Promise<CargaPublicada[]>;
  fechasDeCorte(): Promise<string[]>;
  /** Reemplaza el corte si ya existe uno con la misma fecha. */
  publicar(p: Publicacion): Promise<Resultado>;
}

export interface RepositorioBitacora {
  /** Tiendas activas, ejecutivos (incluidos los de baja) y acciones de los últimos 12 meses. */
  datos(): Promise<DatosBitacora>;
  registrar(a: NuevaAccion): Promise<Resultado<BitAccion>>;
  agregarEjecutivo(tienda: string, nombre: string): Promise<Resultado<BitEjecutivo>>;
  cambiarEstadoEjecutivo(id: number, activo: boolean): Promise<Resultado>;
  marcarPendiente(id: number, hecho: boolean): Promise<Resultado>;
  eliminar(id: number): Promise<Resultado>;
}

export interface RepositorioFoto {
  /** Productos, prioridades, tiendas Entel y respuestas desde la semana indicada. */
  datos(desde: string): Promise<FotoDatos>;
  /** Falla con 'conflicto' si la versión no calza y no se pidió reemplazar. */
  guardar(e: EnvioFoto): Promise<Resultado<FotoGuardada>>;
  crearProducto(p: DatosProducto & { orden: number }): Promise<Resultado<FotoProducto>>;
  editarProducto(id: number, p: DatosProducto): Promise<Resultado>;
  activarProducto(id: number, activo: boolean): Promise<Resultado>;
  eliminarProducto(id: number): Promise<Resultado>;
  /** número null = el producto deja de exigirse en ese cluster. */
  fijarPrioridad(productoId: number, cluster: string, numero: number | null): Promise<Resultado>;
}

export interface ServicioSesion {
  usuarioActual(): Promise<Usuario | null>;
  iniciar(email: string, password: string): Promise<Resultado>;
  cerrar(): Promise<void>;
}

export type RespuestaModelo = { ok: true; mensaje: MensajeChat } | { ok: false; fallo: FalloLLM };

/** Un modelo de lenguaje con tool calling. Hoy es Groq, pero el agente no lo sabe. */
export interface ModeloLenguaje {
  nombre: string;
  responder(
    mensajes: MensajeChat[],
    herramientas: unknown[],
    opciones: { forzarTexto: boolean; signal: AbortSignal },
  ): Promise<RespuestaModelo>;
}

