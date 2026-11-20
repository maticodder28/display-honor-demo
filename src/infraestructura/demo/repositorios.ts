import type { RepositorioBitacora, RepositorioDisplay, RepositorioFoto, ServicioSesion } from '@/aplicacion/puertos';
import { MENSAJE_DEMO } from '@/config';
import { fallo, vacio } from '@/dominio/comun/resultado';
import { crearUsuario } from '@/dominio/usuario';
import { USUARIO_DEMO, bitacoraDemo, cargasDemo, datosDemo, fotoDemo, historialDemo } from './datos';

// Repositorios de la demo pública: leen los datos generados en datos.ts y no guardan nada.
// Cada escritura responde con el aviso de demo, que las pantallas muestran como cualquier otro error.

const noSeGuarda = async () => fallo<never>('demo', MENSAJE_DEMO);

export const repositorioDisplayDemo: RepositorioDisplay = {
  corteActual: async () => datosDemo(),
  historial: async () => historialDemo(),
  cargas: async (limite) => cargasDemo().slice(0, limite),
  fechasDeCorte: async () => cargasDemo().map((c) => c.fecha_corte),
  publicar: noSeGuarda,
};

export const repositorioBitacoraDemo: RepositorioBitacora = {
  datos: async () => bitacoraDemo(),
  registrar: noSeGuarda,
  agregarEjecutivo: noSeGuarda,
  cambiarEstadoEjecutivo: noSeGuarda,
  marcarPendiente: noSeGuarda,
  eliminar: noSeGuarda,
};

export const repositorioFotoDemo: RepositorioFoto = {
  datos: async (desde) => fotoDemo(desde),
  guardar: noSeGuarda,
  crearProducto: noSeGuarda,
  editarProducto: noSeGuarda,
  activarProducto: noSeGuarda,
  eliminarProducto: noSeGuarda,
  fijarPrioridad: noSeGuarda,
};

/** En la demo no hay login: siempre entra el usuario demo, con rol admin para que se vea todo. */
export const sesionDemo: ServicioSesion = {
  usuarioActual: async () => crearUsuario(USUARIO_DEMO),
  iniciar: async () => vacio(),
  cerrar: async () => {},
};
