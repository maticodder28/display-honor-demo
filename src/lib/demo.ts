/**
 * Modo demo: la app funciona sin Supabase y sin login. Usa las tiendas reales de la zona con numeros ficticios
 * generados en memoria.
 * Se activa con NEXT_PUBLIC_DEMO=1. Sirve para mostrar el proyecto sin exponer datos reales.
 *
 * Los datos salen de un generador con semilla fija, asi cada visita ve los mismos numeros.
 * Las fechas se calculan desde hoy, para que la demo siempre se vea al dia.
 */
import type { FotoPrioridad, FotoProducto, FotoRespuesta, FotoSemana, FotoTienda } from './foto';
import { lunesDe, sumarDias } from './foto';
import type { Corte, Historial } from './historial';
import { metricasVacias, type Cobertura, type DatosCarga, type MetricaDato, type Tienda } from './types';

export { DEMO } from './modo';

// ---------------------------------------------------------------------
// Generador pseudoaleatorio con semilla (mulberry32): mismos datos en cada request.
// ---------------------------------------------------------------------
function rng(semilla: number) {
  let a = semilla >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    r,
    entre: (min: number, max: number) => min + Math.floor(r() * (max - min + 1)),
    elegir: <T,>(l: readonly T[]) => l[Math.floor(r() * l.length)],
    prob: (p: number) => r() < p,
  };
}

const hoyChile = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

// ---------------------------------------------------------------------
// Catalogo ficticio
// ---------------------------------------------------------------------
export const MARCAS_DEMO = ['Honor', 'Samsung', 'Apple', 'Xiaomi', 'Motorola', 'Oppo', 'Vivo', 'Infinix', 'ZTE', 'Huawei'];
/** Peso relativo de cada marca en la exhibicion de una tienda tipica. */
const PESO = [12, 30, 14, 15, 10, 6, 4, 3, 3, 3];

/**
 * Tiendas reales de la Zona Norte (nombre, cadena, ciudad y region): son locales publicos.
 * Lo interno se inventa: codigos, cobertura de cada tienda, clusters y todas las cantidades.
 * El ultimo campo marca una tienda cerrada.
 */
const TIENDAS_ZONA: [string, string, string, string, true?][] = [
  ['RIPLEY LA SERENA', 'Ripley', 'La Serena', 'Coquimbo'],
  ['WOM SUCURSAL LA SERENA CORDOVEZ', 'WOM', 'La Serena', 'Coquimbo'],
  ['MOVISTAR COPIAPO', 'Movistar', 'Copiapó', 'Atacama'],
  ['WOM SUCURSAL COPIAPO CENTRO 01', 'WOM', 'Copiapó', 'Atacama'],
  ['CLARO LA SERENA', 'Claro', 'La Serena', 'Coquimbo'],
  ['ENTEL AUSTRAL COPIAPO', 'Entel', 'Copiapó', 'Atacama'],
  ['ENTEL QUINTEL LA SERENA', 'Entel', 'La Serena', 'Coquimbo'],
  ['ENTEL QUINTEL OVALLE VIC. MACKENNA 115', 'Entel', 'Ovalle', 'Coquimbo'],
  ['MOVISTAR SUC LA SERENA DL', 'Movistar', 'La Serena', 'Coquimbo'],
  ['WOM SUCURSAL PLAZA LA SERENA', 'WOM', 'La Serena', 'Coquimbo'],
  ['LA POLAR LA SERENA', 'ABC', 'La Serena', 'Coquimbo'],
  ['FALABELLA MALL COPIAPO', 'Falabella', 'Copiapó', 'Atacama'],
  ['FALABELLA MALL PLAZA LA SERENA', 'Falabella', 'La Serena', 'Coquimbo'],
  ['FALABELLA OVALLE', 'Falabella', 'Ovalle', 'Coquimbo'],
  ['HITES LA SERENA', 'Hites', 'La Serena', 'Coquimbo'],
  ['HITES OVALLE', 'Hites', 'Ovalle', 'Coquimbo'],
  ['PARIS COQUIMBO', 'Paris', 'Coquimbo', 'Coquimbo'],
  ['PARIS PLAZA LA SERENA', 'Paris', 'La Serena', 'Coquimbo'],
  ['CLARO COPIAPO', 'Claro', 'Copiapó', 'Atacama'],
  ['CLARO COQUIMBO', 'Claro', 'Coquimbo', 'Coquimbo'],
  ['ENTEL QUINTEL COQUIMBO', 'Entel', 'Coquimbo', 'Coquimbo'],
  ['ENTEL QUINTEL LA SERENA BALMACEDA', 'Entel', 'La Serena', 'Coquimbo'],
  ['MOVISTAR SUC COQUIMBO', 'Movistar', 'Coquimbo', 'Coquimbo'],
  ['MOVISTAR SUC LA SERENA', 'Movistar', 'La Serena', 'Coquimbo'],
  ['MOVISTAR SUC OVALLE', 'Movistar', 'Ovalle', 'Coquimbo'],
  ['MOVISTAR SUC PZA COPIAPO', 'Movistar', 'Copiapó', 'Atacama'],
  ['MOVISTAR SUC SERENA PRAT', 'Movistar', 'La Serena', 'Coquimbo'],
  ['VTR 3G BODEGA SUCURSAL COQUIMBO', 'Claro', 'Coquimbo', 'Coquimbo'],
  ['VTR 3G BODEGA SUCURSAL LA SERENA', 'Claro', 'La Serena', 'Coquimbo'],
  ['WOM SUCURSAL COQUIMBO', 'WOM', 'Coquimbo', 'Coquimbo'],
  ['WOM SUCURSAL LA SERENA CENTRO 01', 'WOM', 'La Serena', 'Coquimbo'],
  ['WOM SUCURSAL MALL VIVO COQUIMBO', 'WOM', 'Coquimbo', 'Coquimbo'],
  ['WOM SUCURSAL OVALLE', 'WOM', 'Ovalle', 'Coquimbo', true],
  ['WOM SUCURSAL OVALLE 02', 'WOM', 'Ovalle', 'Coquimbo'],
  ['WOM SUCURSAL PLAZA COPIAPO', 'WOM', 'Copiapó', 'Atacama'],
  ['PARIS OVALLE', 'Paris', 'Ovalle', 'Coquimbo'],
  ['LA POLAR OVALLE', 'ABC', 'Ovalle', 'Coquimbo'],
  ['HITES COPIAPO', 'Hites', 'Copiapó', 'Atacama'],
  ['RIPLEY COQUIMBO', 'Ripley', 'Coquimbo', 'Coquimbo'],
  ['HITES COQUIMBO', 'Hites', 'Coquimbo', 'Coquimbo'],
  ['ABCDIN VALLENAR', 'ABC', 'Vallenar', 'Atacama'],
  ['CLARO VALLENAR', 'Claro', 'Vallenar', 'Atacama'],
  ['ENTEL AUSTRAL VALLENAR', 'Entel', 'Vallenar', 'Atacama'],
  ['MOVISTAR SUC VALLENAR', 'Movistar', 'Vallenar', 'Atacama'],
  ['WOM SUCURSAL VALLENAR CENTRO 01', 'WOM', 'Vallenar', 'Atacama'],
  ['CLARO DAC SUCURSAL OVALLE', 'Claro', 'Ovalle', 'Coquimbo'],
  ['MOVISTAR SUC MALL PLAZA LA SERENA', 'Movistar', 'La Serena', 'Coquimbo'],
  ['RIPLEY COPIAPO', 'Ripley', 'Copiapó', 'Atacama'],
  ['WALMART LA SERENA', 'Walmart', 'La Serena', 'Coquimbo'],
];

export const PERFILES_DEMO = [
  { id: 'demo', nombre: 'Usuario Demo', cargo: 'Administrador' },
  { id: 'p-sup', nombre: 'Andrea Rojas', cargo: 'Supervisora' },
  { id: 'p-ent', nombre: 'Felipe Castro', cargo: 'Entrenador' },
  { id: 'p-pro1', nombre: 'Camila Torres', cargo: 'Promotora' },
  { id: 'p-pro2', nombre: 'Diego Vega', cargo: 'Promotor' },
];

export const USUARIO_DEMO = {
  id: 'demo',
  email: 'demo@ejemplo.cl',
  nombre: 'Usuario Demo',
  cargo: 'Administrador',
  rol: 'admin',
  esAdmin: true,
  puedeRegistrar: true,
  esPromotor: false,
  tiendaCodigo: null as string | null,
};

interface TiendaDemo extends Tienda {
  /** Afinidad de la tienda con Honor: mueve su share hacia arriba o abajo. */
  afinidad: number;
  tamano: number;
}

function generarTiendas(): TiendaDemo[] {
  const g = rng(7);
  return TIENDAS_ZONA.map(([tienda, cliente, ciudad, region, cerrada], i) => {
    const x = g.r();
    const cobertura: Cobertura = cerrada ? 'Cerrada' : x < 0.45 ? 'Promotor' : x < 0.9 ? 'Middle Management' : 'Sin cobertura';
    return {
      codigo: `DM${101 + i}`,
      tienda,
      cliente,
      ciudad,
      region,
      cobertura,
      afinidad: (cobertura === 'Promotor' ? 1.5 : cobertura === 'Middle Management' ? 1 : 0.6) * (0.7 + g.r() * 0.6),
      tamano: g.entre(18, 60),
    };
  });
}

const TIENDAS = generarTiendas();
export const tiendasDemo = (): Tienda[] => TIENDAS.map(({ afinidad: _a, tamano: _t, ...t }) => t);

/** Reparte `total` unidades entre las marcas segun pesos, con algo de ruido. */
function repartir(g: ReturnType<typeof rng>, total: number, pesos: number[]): number[] {
  const w = pesos.map((p) => p * (0.6 + g.r() * 0.8));
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => Math.max(0, Math.round((x / s) * total)));
}

/** Corte numero `k` (0 = el mas antiguo) de `n`. Honor mejora de a poco a lo largo de los cortes. */
function generarCorte(k: number, n: number, fecha: string): DatosCarga['metricas'] {
  const g = rng(1000 + k);
  const met = metricasVacias();
  const avance = n > 1 ? k / (n - 1) : 1;
  for (const t of TIENDAS) {
    const pesos = [...PESO];
    pesos[0] = PESO[0] * t.afinidad * (0.85 + 0.35 * avance);
    const fechaTienda = sumarDias(fecha, -g.entre(0, 6));
    const fila = (v: number[]) => ({ fecha: fechaTienda, v });
    if (t.cobertura === 'Cerrada') continue;
    // Algunas tiendas sin cobertura quedan sin levantamiento en algunos cortes.
    if (t.cobertura === 'Sin cobertura' && g.prob(0.25)) continue;
    met.exhibiciones[t.codigo] = fila(repartir(g, t.tamano + g.entre(-3, 3), pesos));
    met.muebles_dc[t.codigo] = fila(MARCAS_DEMO.map((_, i) => (g.prob(i === 0 ? 0.5 + 0.3 * avance : 1 / (i + 1.2)) ? g.entre(1, 2) : 0)));
    if (t.cliente !== 'ABC' && t.cliente !== 'Hites')
      met.muebles_dz[t.codigo] = fila(MARCAS_DEMO.map((_, i) => (i < 4 && g.prob(0.45) ? 1 : 0)));
    met.promotores[t.codigo] = fila(MARCAS_DEMO.map((_, i) => {
      if (i === 0) return t.cobertura === 'Promotor' ? 1 : 0;
      return g.prob(i <= 2 ? 0.55 : 0.18) ? 1 : 0;
    }));
  }
  return met;
}

// ---------------------------------------------------------------------
// Dashboard e Historial
// ---------------------------------------------------------------------
const N_CORTES = 7;

export function historialDemo(): Historial {
  const hoy = hoyChile();
  const cortes: Corte[] = [];
  for (let k = 0; k < N_CORTES; k++) {
    const fecha = sumarDias(hoy, -2 - 14 * (N_CORTES - 1 - k));
    cortes.push({
      id: k + 1,
      fecha,
      archivo: `Levantamiento_Demo_${fecha}.xlsx`,
      created_at: `${fecha}T21:30:00.000Z`,
      por: k === 0 ? null : 'Usuario Demo',
      marcas: MARCAS_DEMO,
      metricas: generarCorte(k, N_CORTES, fecha),
    });
  }
  return { tiendas: tiendasDemo(), cortes };
}

export function datosDemo() {
  const h = historialDemo();
  const c = h.cortes[h.cortes.length - 1];
  return {
    raw: { marcas: c.marcas, tiendas: h.tiendas, metricas: c.metricas } as DatosCarga,
    carga: { id: c.id, archivo: c.archivo, created_at: c.created_at, fecha_corte: c.fecha },
  };
}

export function cargasDemo() {
  const h = historialDemo();
  const activas = h.tiendas.filter((t) => t.cobertura !== 'Cerrada').length;
  return h.cortes.slice().reverse().map((c) => {
    // Mismo formato que publica el Excel real: tiendas con levantamiento / tiendas activas.
    const resumen = Object.fromEntries((['exhibiciones', 'muebles_dc', 'muebles_dz', 'promotores'] as MetricaDato[])
      .map((m) => [m, `${Object.keys(c.metricas[m]).length}/${activas}`]));
    return { id: c.id, fecha_corte: c.fecha, archivo: c.archivo, created_at: c.created_at, resumen, por_nombre: c.por };
  });
}

// ---------------------------------------------------------------------
// Bitacora
// ---------------------------------------------------------------------
const NOMBRES = ['Javiera', 'Matías', 'Constanza', 'Benjamín', 'Fernanda', 'Tomás', 'Valentina', 'Ignacio', 'Catalina', 'Sebastián', 'Antonia', 'Joaquín'];
const APELLIDOS = ['Araya', 'Cortés', 'Pizarro', 'Rivera', 'Muñoz', 'Rojas', 'Flores', 'Castillo', 'Tapia', 'Alvarez'];
const DETALLES: Record<string, string[]> = {
  visita: ['Revisión de exhibición y precios', 'Exhibición ordenada, faltaba material POP', 'Stock OK, se reubicó el demo', 'Se revisó vitrina y cartelería'],
  venta: ['Ventas de la semana', 'Venta de equipos gama media', 'Cierre de semana'],
  incentivo: ['Audífonos por meta mensual', 'Gift card por ventas de la semana', 'Polera y gorro por campaña'],
  capacitacion: ['Capacitación línea X', 'Argumentos de venta del modelo nuevo', 'Comparativa frente a la competencia'],
  implementacion: ['Se instaló mueble DC', 'Se cambió gráfica de campaña', 'Se corrigió demo sin carga'],
  observacion: ['Quiebre de stock en modelo de entrada', 'La competencia instaló mueble nuevo', 'Ejecutivo pide más material'],
};

export function bitacoraDemo() {
  const g = rng(42);
  const hoy = hoyChile();
  const tiendas = TIENDAS.filter((t) => t.cobertura !== 'Cerrada' && (t.cobertura !== 'Sin cobertura' || g.prob(0.5)))
    .map((t) => ({ codigo: t.codigo, nombre: t.tienda, cliente: t.cliente, ciudad: t.ciudad, cobertura: t.cobertura }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const ejecutivos: { id: number; tienda_codigo: string; nombre: string; activo: boolean }[] = [];
  let idEj = 1;
  for (const t of tiendas) {
    const n = g.entre(2, 4);
    for (let i = 0; i < n; i++)
      ejecutivos.push({ id: idEj++, tienda_codigo: t.codigo, nombre: `${g.elegir(NOMBRES)} ${g.elegir(APELLIDOS)}`, activo: !g.prob(0.08) });
  }
  const autores = ['demo', 'p-sup', 'p-ent'];
  const acciones: {
    id: number; tienda_codigo: string; fecha: string; tipo: string; ejecutivo_id: number | null; detalle: string;
    unidades: number | null; costo: number | null; pendiente: boolean; hecho: boolean; creado_por: string; created_at: string;
  }[] = [];
  let id = 1;
  for (const t of tiendas) {
    const ejs = ejecutivos.filter((e) => e.tienda_codigo === t.codigo);
    const n = g.entre(4, 16);
    for (let i = 0; i < n; i++) {
      const fecha = sumarDias(hoy, -g.entre(0, 110));
      const x = g.r();
      const tipo = x < 0.35 ? 'visita' : x < 0.62 ? 'venta' : x < 0.72 ? 'incentivo' : x < 0.82 ? 'capacitacion' : x < 0.9 ? 'implementacion' : 'observacion';
      const ej = tipo === 'venta' || tipo === 'incentivo' ? g.elegir(ejs) : null;
      const pendiente = (tipo === 'observacion' || tipo === 'implementacion') && g.prob(0.5);
      acciones.push({
        id: id++, tienda_codigo: t.codigo, fecha, tipo, ejecutivo_id: ej?.id ?? null, detalle: g.elegir(DETALLES[tipo]),
        unidades: tipo === 'venta' ? g.entre(1, 8) : null,
        costo: tipo === 'incentivo' ? g.entre(3, 12) * 5000 : null,
        pendiente, hecho: pendiente && g.prob(0.55), creado_por: g.elegir(autores), created_at: `${fecha}T15:00:00.000Z`,
      });
    }
  }
  acciones.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.id - a.id));
  return { tiendas, ejecutivos, acciones, perfiles: PERFILES_DEMO };
}

// ---------------------------------------------------------------------
// Foto del Exito
// ---------------------------------------------------------------------
const PRODUCTOS: Omit<FotoProducto, 'orden' | 'activo'>[] = [
  { id: 1, nombre: 'Modelo Alpha Pro', corto: 'A Pro', tipo: 'Equipo' },
  { id: 2, nombre: 'Modelo Alpha', corto: 'Alpha', tipo: 'Equipo' },
  { id: 3, nombre: 'Modelo Beta Lite', corto: 'B Lite', tipo: 'Equipo' },
  { id: 4, nombre: 'Modelo Gamma 5G', corto: 'G 5G', tipo: 'Equipo' },
  { id: 5, nombre: 'Modelo Gamma', corto: 'Gamma', tipo: 'Equipo' },
  { id: 6, nombre: 'Modelo Delta', corto: 'Delta', tipo: 'Equipo' },
  { id: 7, nombre: 'Tablet Pad 11', corto: 'Pad', tipo: 'Equipo' },
  { id: 8, nombre: 'Reloj Watch 6', corto: 'Watch', tipo: 'Accesorio' },
  { id: 9, nombre: 'Audífonos Buds', corto: 'Buds', tipo: 'Accesorio' },
];
const EXIGIDOS: Record<string, number[]> = { K: [1, 2, 3, 4, 5, 6, 7], A: [1, 2, 3, 4, 5], B: [2, 3, 4, 5], C: [3, 5, 6] };

export function fotoDemo(desde: string) {
  const g = rng(99);
  const hoy = hoyChile();
  const actual = lunesDe(hoy);
  const productos: FotoProducto[] = PRODUCTOS.map((p, i) => ({ ...p, orden: i + 1, activo: true }));
  const prioridades: FotoPrioridad[] = Object.entries(EXIGIDOS).flatMap(([cluster, ids]) =>
    ids.map((producto_id, i) => ({ producto_id, cluster, numero: i + 1 })));
  const clusters = ['K', 'A', 'B', 'C'];
  const tiendas: FotoTienda[] = TIENDAS.filter((t) => t.cliente === 'Entel' && t.cobertura !== 'Sin cobertura').map((t, i) => ({
    codigo: t.codigo, tienda: t.tienda, ciudad: t.ciudad, cobertura: t.cobertura,
    codigo_b2b: `B2B-${4100 + i}`, codigo_corto: `E${20 + i}`, cluster: clusters[i % 4], merchandiser: 'Usuario Demo',
  }));
  const semanas: string[] = [];
  for (let s = actual; s >= desde && semanas.length < 10; s = sumarDias(s, -7)) semanas.push(s);
  const semanasPrio: FotoSemana[] = semanas.map((semana) => ({ semana, prioridades }));
  const respuestas: FotoRespuesta[] = [];
  let id = 1;
  for (const [k, semana] of semanas.entries()) {
    for (const t of tiendas) {
      if (k === 0 && g.prob(0.4)) continue; // semana en curso: aun faltan respuestas
      const pedidos = productos.map((p) => p.id);
      const requeridos = EXIGIDOS[t.cluster ?? 'C'];
      const base = 0.62 + 0.03 * (semanas.length - k) / semanas.length * 4;
      const exhibidos = pedidos.filter((p) => g.prob(requeridos.includes(p) ? base : 0.35));
      const mesas = Array.from({ length: g.entre(0, 3) }, () => g.entre(2, 6));
      const fecha = sumarDias(semana, g.entre(0, k === 0 ? Math.max(0, Math.min(6, Math.round((Date.parse(hoy) - Date.parse(semana)) / 86400000))) : 5));
      respuestas.push({
        id: id++, semana, tienda_codigo: t.codigo, pedidos, requeridos, exhibidos, mesas,
        comentario: g.prob(0.15) ? g.elegir(['Solo dummies del modelo nuevo', 'Falta código en sistema', 'Mesa genérica compartida con otra marca']) : '',
        actualizado_por: t.cobertura === 'Promotor' ? g.elegir(['p-pro1', 'p-pro2']) : g.elegir(['p-sup', 'p-ent']),
        updated_at: `${fecha}T18:20:00.000Z`,
      });
    }
  }
  return { productos, prioridades, semanasPrio, tiendas, respuestas, perfiles: PERFILES_DEMO };
}
