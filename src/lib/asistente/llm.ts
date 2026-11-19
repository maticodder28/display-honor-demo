/**
 * Respaldo con un LLM (Groq, API compatible con OpenAI) para las preguntas que el motor propio no entiende.
 *
 * El modelo NO redacta la respuesta: solo elige una de nuestras herramientas y sus filtros (tool calling).
 * Los argumentos se validan contra los datos reales y la respuesta la calcula el mismo codigo del motor propio,
 * asi que los numeros nunca salen del modelo.
 */
import type { Historial } from '../historial';
import { METRICAS, type Cobertura, type Metrica, type Tienda } from '../types';
import { extraer, type Entidades } from './entidades';
import type { Dimension } from './herramientas';
import type { Intencion } from './intenciones';
import { ejecutar, type Resultado } from './motor';
import { normalizar } from './texto';

export const MODELO_POR_DEFECTO = 'openai/gpt-oss-20b';
const URL_GROQ = 'https://api.groq.com/openai/v1/chat/completions';

interface Catalogo { ciudades: string[]; clientes: string[]; marcas: string[]; tiendas: Tienda[] }

function catalogoDe(d: Historial): Catalogo {
  return {
    ciudades: [...new Set(d.tiendas.map((t) => t.ciudad))].sort(),
    clientes: [...new Set(d.tiendas.map((t) => t.cliente))].sort(),
    marcas: [...new Set(d.cortes.flatMap((c) => c.marcas))],
    tiendas: d.tiendas,
  };
}

const HERRAMIENTAS: { nombre: Intencion; descripcion: string }[] = [
  { nombre: 'resumen', descripcion: 'Share (participacion) de Honor y su puesto en una metrica, opcionalmente comparado con otra marca.' },
  { nombre: 'lider', descripcion: 'Que marca lidera y el ranking de marcas.' },
  { nombre: 'ranking_tiendas', descripcion: 'Tiendas ordenadas por share de Honor (las mas debiles o las mas fuertes).' },
  { nombre: 'tendencia', descripcion: 'Evolucion del share de Honor a lo largo de los cortes (en el tiempo).' },
  { nombre: 'cambios_tiendas', descripcion: 'Que tiendas subieron o bajaron entre el corte anterior y el ultimo.' },
  { nombre: 'por_grupo', descripcion: 'Share de Honor comparado por ciudad, cliente (cadena) o cobertura.' },
  { nombre: 'detalle_tienda', descripcion: 'Todas las metricas de una tienda puntual.' },
  { nombre: 'sin_levantamiento', descripcion: 'Tiendas que no tienen medicion (levantamiento) en el ultimo corte.' },
  { nombre: 'ayuda', descripcion: 'Saludos, agradecimientos o preguntas sobre que puede hacer el asistente.' },
  { nombre: 'fuera', descripcion: 'La pregunta no trata sobre estos datos de exhibicion, muebles o promotores.' },
];

/** Definicion de herramientas en formato OpenAI, con los valores validos sacados de los datos. */
export function definirHerramientas(d: Historial) {
  const c = catalogoDe(d);
  const filtros = {
    metrica: { type: 'string', enum: METRICAS.map(([m]) => m), description: 'exhibiciones (equipos exhibidos), muebles (total), muebles_dc, muebles_dz (display zone) o promotores. Por defecto exhibiciones.' },
    ciudad: { type: 'string', enum: c.ciudades },
    cliente: { type: 'string', enum: c.clientes, description: 'Cadena u operador.' },
    cobertura: { type: 'string', enum: ['Promotor', 'Middle Management', 'Sin cobertura'] },
    marca: { type: 'string', enum: c.marcas.filter((m) => m !== 'Honor'), description: 'Marca de la competencia nombrada.' },
    tienda: { type: 'string', description: 'Codigo (ej. DM101) o nombre de la tienda.' },
    n: { type: 'integer', minimum: 1, maximum: 20, description: 'Cuantas tiendas mostrar.' },
    direccion: { type: 'string', enum: ['mejor', 'peor'], description: 'mejor = mayor share o subidas; peor = menor share o caidas.' },
    dimension: { type: 'string', enum: ['ciudad', 'cliente', 'cobertura'], description: 'Solo para por_grupo.' },
  };
  return HERRAMIENTAS.map((h) => ({
    type: 'function' as const,
    function: { name: h.nombre, description: h.descripcion, parameters: { type: 'object', properties: h.nombre === 'ayuda' || h.nombre === 'fuera' ? {} : filtros } },
  }));
}

const SISTEMA = `Eres el enrutador de un asistente de datos de merchandising de la marca Honor en tiendas de Chile.
Tu unica tarea es llamar exactamente UNA herramienta con los filtros que pide la pregunta. No respondas con texto.
"Share" o "participacion" es el porcentaje de Honor sobre el total de todas las marcas.
"Corte" o "levantamiento" es una medicion de las tiendas en una fecha.
Si la pregunta no trata sobre estos datos, llama a "fuera".`;

/** Convierte los argumentos del modelo en entidades validas; descarta lo que no exista en los datos. */
export function argumentosAEntidades(args: Record<string, unknown>, d: Historial, pregunta: string): { e: Entidades; dim?: Dimension } {
  const c = catalogoDe(d);
  const enLista = (v: unknown, lista: string[]) => (typeof v === 'string' ? lista.find((x) => normalizar(x) === normalizar(v)) ?? null : null);
  // Lo que el extractor propio ya detecto sirve de base (ej. una tienda nombrada).
  const base = extraer(pregunta, { tiendas: d.tiendas, marcas: c.marcas }).entidades;
  let tienda = base.tienda;
  if (typeof args.tienda === 'string' && args.tienda.trim()) {
    const t = extraer(args.tienda, { tiendas: d.tiendas, marcas: c.marcas }).entidades;
    tienda = t.tienda ?? tienda;
  }
  const n = typeof args.n === 'number' && Number.isInteger(args.n) && args.n >= 1 && args.n <= 20 ? args.n : null;
  const dim = enLista(args.dimension, ['ciudad', 'cliente', 'cobertura']) as Dimension | null;
  return {
    e: {
      metrica: (enLista(args.metrica, METRICAS.map(([m]) => m)) as Metrica | null) ?? base.metrica,
      ciudad: enLista(args.ciudad, c.ciudades) ?? base.ciudad,
      cliente: enLista(args.cliente, c.clientes) ?? base.cliente,
      cobertura: (enLista(args.cobertura, ['Promotor', 'Middle Management', 'Sin cobertura']) as Cobertura | null) ?? base.cobertura,
      marca: enLista(args.marca, c.marcas.filter((m) => m !== 'Honor')) ?? base.marca,
      tienda,
      tiendasPosibles: tienda ? [] : base.tiendasPosibles,
      n: n ?? base.n,
      direccion: args.direccion === 'mejor' || args.direccion === 'peor' ? args.direccion : base.direccion,
    },
    dim: dim ?? undefined,
  };
}

export type FalloLLM = 'sin_clave' | 'limite' | 'tiempo' | 'error' | 'sin_herramienta';

export interface OpcionesLLM {
  apiKey: string | undefined;
  modelo?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/** Pregunta a Groq que herramienta usar y ejecuta la respuesta con nuestros datos. */
export async function responderConLLM(pregunta: string, d: Historial, o: OpcionesLLM): Promise<{ ok: true; resultado: Resultado } | { ok: false; fallo: FalloLLM }> {
  if (!o.apiKey) return { ok: false, fallo: 'sin_clave' };
  const modelo = o.modelo || MODELO_POR_DEFECTO;
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 8000);
  try {
    const r = await (o.fetchFn ?? fetch)(URL_GROQ, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${o.apiKey}` },
      body: JSON.stringify({
        model: modelo,
        temperature: 0,
        max_tokens: 300,
        tool_choice: 'required',
        tools: definirHerramientas(d),
        messages: [{ role: 'system', content: SISTEMA }, { role: 'user', content: pregunta.slice(0, 300) }],
      }),
    });
    if (r.status === 429) return { ok: false, fallo: 'limite' };
    if (!r.ok) return { ok: false, fallo: 'error' };
    const json = (await r.json()) as { choices?: { message?: { tool_calls?: { function?: { name?: string; arguments?: string } }[] } }[] };
    const llamada = json.choices?.[0]?.message?.tool_calls?.[0]?.function;
    const nombre = HERRAMIENTAS.find((h) => h.nombre === llamada?.name)?.nombre;
    if (!nombre) return { ok: false, fallo: 'sin_herramienta' };
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(llamada?.arguments || '{}'); } catch { args = {}; }
    const { e, dim } = argumentosAEntidades(args, d, pregunta);
    // Si nombra una tienda puntual y la herramienta es de toda la zona, el detalle de la tienda es mas util.
    const intencion: Intencion = e.tienda && (nombre === 'resumen' || nombre === 'lider') ? 'detalle_tienda' : nombre;
    return {
      ok: true,
      resultado: {
        pregunta, intencion, confianza: 1, alternativas: [], entidades: e, regla: null, origen: `Groq (${modelo})`,
        respuesta: ejecutar(intencion, e, d, pregunta, dim),
      },
    };
  } catch (err) {
    return { ok: false, fallo: (err as Error)?.name === 'AbortError' ? 'tiempo' : 'error' };
  } finally {
    clearTimeout(reloj);
  }
}
