/**
 * Agente con Groq (API compatible con OpenAI): responde preguntas abiertas razonando sobre los datos.
 *
 *   pregunta -> el modelo decide que consultar -> nuestras herramientas devuelven datos -> (repite) -> analisis final
 *
 * El modelo solo ve numeros que salen de nuestras herramientas. Al final, un verificador compara cada cifra
 * de la respuesta con los resultados de las consultas y marca las que no se pueden comprobar.
 */
import type { Historial } from '../historial';
import { METRICAS, type Cobertura, type Metrica, type Tienda } from '../types';
import { extraer, type Entidades } from './entidades';
import type { Dimension, Respuesta } from './herramientas';
import type { Intencion } from './intenciones';
import { ejecutar, type Analisis, type Resultado } from './motor';
import { normalizar } from './texto';

export const MODELO_POR_DEFECTO = 'openai/gpt-oss-20b';
const URL_GROQ = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_CONSULTAS = 5;

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
  { nombre: 'resumen', descripcion: 'Share (participacion) de Honor y su puesto en una metrica, con las 5 marcas principales y el cambio vs el corte anterior.' },
  { nombre: 'lider', descripcion: 'Ranking completo de marcas en una metrica.' },
  { nombre: 'ranking_tiendas', descripcion: 'Tiendas ordenadas por share de Honor (direccion peor = mas debiles, mejor = mas fuertes).' },
  { nombre: 'tendencia', descripcion: 'Evolucion del share de Honor en todos los cortes.' },
  { nombre: 'cambios_tiendas', descripcion: 'Tiendas que subieron o bajaron entre el corte anterior y el ultimo.' },
  { nombre: 'por_grupo', descripcion: 'Share de Honor por ciudad, cliente (cadena) o cobertura.' },
  { nombre: 'detalle_tienda', descripcion: 'Todas las metricas de una tienda puntual.' },
  { nombre: 'sin_levantamiento', descripcion: 'Tiendas sin medicion en el ultimo corte.' },
];

/** Definicion de herramientas en formato OpenAI, con los valores validos sacados de los datos. */
export function definirHerramientas(d: Historial) {
  const c = catalogoDe(d);
  const filtros = {
    metrica: { type: 'string', enum: METRICAS.map(([m]) => m), description: 'exhibiciones (equipos exhibidos), muebles (total), muebles_dc, muebles_dz (display zone) o promotores. Por defecto exhibiciones.' },
    ciudad: { type: 'string', enum: c.ciudades },
    cliente: { type: 'string', enum: c.clientes, description: 'Cadena u operador.' },
    cobertura: { type: 'string', enum: ['Promotor', 'Middle Management', 'Sin cobertura'] },
    marca: { type: 'string', enum: c.marcas.filter((m) => m !== 'Honor'), description: 'Marca de la competencia con la que comparar.' },
    tienda: { type: 'string', description: 'Codigo (ej. DM101) o nombre de la tienda.' },
    n: { type: 'integer', minimum: 1, maximum: 20, description: 'Cuantas tiendas mostrar.' },
    direccion: { type: 'string', enum: ['mejor', 'peor'], description: 'mejor = mayor share o subidas; peor = menor share o caidas.' },
    dimension: { type: 'string', enum: ['ciudad', 'cliente', 'cobertura'], description: 'Solo para por_grupo.' },
  };
  return HERRAMIENTAS.map((h) => ({
    type: 'function' as const,
    function: { name: h.nombre, description: h.descripcion, parameters: { type: 'object', properties: filtros } },
  }));
}

/** Convierte los argumentos del modelo en entidades validas; descarta lo que no exista en los datos. */
export function argumentosAEntidades(args: Record<string, unknown>, d: Historial): { e: Entidades; dim?: Dimension } {
  const c = catalogoDe(d);
  const enLista = (v: unknown, lista: string[]) => (typeof v === 'string' ? lista.find((x) => normalizar(x) === normalizar(v)) ?? null : null);
  let tienda: Tienda | null = null;
  let tiendasPosibles: Tienda[] = [];
  if (typeof args.tienda === 'string' && args.tienda.trim()) {
    const t = extraer(args.tienda, { tiendas: d.tiendas, marcas: c.marcas }).entidades;
    tienda = t.tienda;
    tiendasPosibles = t.tiendasPosibles;
  }
  const n = typeof args.n === 'number' && Number.isInteger(args.n) && args.n >= 1 && args.n <= 20 ? args.n : null;
  const dim = enLista(args.dimension, ['ciudad', 'cliente', 'cobertura']) as Dimension | null;
  return {
    e: {
      metrica: enLista(args.metrica, METRICAS.map(([m]) => m)) as Metrica | null,
      ciudad: enLista(args.ciudad, c.ciudades),
      cliente: enLista(args.cliente, c.clientes),
      cobertura: enLista(args.cobertura, ['Promotor', 'Middle Management', 'Sin cobertura']) as Cobertura | null,
      marca: enLista(args.marca, c.marcas.filter((m) => m !== 'Honor')),
      tienda,
      tiendasPosibles,
      n,
      direccion: args.direccion === 'mejor' || args.direccion === 'peor' ? args.direccion : null,
    },
    dim: dim ?? undefined,
  };
}

/** Resultado de una herramienta como texto compacto para el modelo (texto + tabla, maximo 15 filas). */
export function aTexto(r: Respuesta): string {
  const limpio = r.texto.replace(/\*\*/g, '');
  if (!r.tabla) return limpio;
  const filas = r.tabla.filas.slice(0, 15).map((f) => f.join(' | '));
  const extra = r.tabla.filas.length > 15 ? `\n(${r.tabla.filas.length - 15} filas mas)` : '';
  return `${limpio}\n${r.tabla.columnas.join(' | ')}\n${filas.join('\n')}${extra}`;
}

/** Cifras con % o pp de un texto, normalizadas ("15.4 %" -> "15,4%", "+3,2 pp" -> "3,2pp"). */
export function cifras(texto: string): string[] {
  return [...texto.matchAll(/(\d+(?:[.,]\d+)?)\s*(%|pp\b|puntos)/g)].map((m) => `${m[1].replace('.', ',')}${m[2] === '%' ? '%' : 'pp'}`);
}

/** Separa las cifras de la respuesta en verificadas (aparecen en las consultas) y sin verificar. */
export function verificar(respuesta: string, consultas: string[]): { verificadas: number; sinVerificar: string[] } {
  const fuente = new Set(consultas.flatMap(cifras));
  const enRespuesta = [...new Set(cifras(respuesta))];
  const sinVerificar = enRespuesta.filter((c) => !fuente.has(c) && !fuente.has(c.replace(/,0(%|pp)$/, '$1')) && !fuente.has(c.replace(/^(\d+)(%|pp)$/, '$1,0$2')));
  return { verificadas: enRespuesta.length - sinVerificar.length, sinVerificar };
}

type Paso = Analisis['pasos'][number];

export type FalloLLM = 'sin_clave' | 'limite' | 'tiempo' | 'error' | 'sin_respuesta';

export interface OpcionesAgente {
  apiKey: string | undefined;
  modelo?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  /** Ultimos turnos de la conversacion, para entender preguntas de seguimiento ("¿y en Ovalle?"). */
  historial?: { pregunta: string; respuesta: string }[];
}

function sistema(d: Historial): string {
  const c = catalogoDe(d);
  const cortes = d.cortes.map((x) => x.fecha);
  return `Eres un analista de merchandising de la marca de celulares Honor en la Zona Norte de Chile. Respondes al equipo de terreno.
Datos disponibles (usa las herramientas para obtenerlos): share de Honor frente a otras marcas en exhibiciones, muebles y promotores,
por tienda, ciudad (${c.ciudades.join(', ')}), cliente o cadena (${c.clientes.join(', ')}) y cobertura. Hay ${cortes.length} cortes (mediciones), del ${cortes[0] ?? '-'} al ${cortes[cortes.length - 1] ?? '-'}.
"Share" es el porcentaje de Honor sobre el total de todas las marcas.

Reglas:
- Antes de afirmar cualquier cifra, consulta las herramientas. Usa solo cifras que aparezcan en sus resultados; no las inventes ni las estimes.
- Si necesitas varias miradas (por ejemplo situacion actual, evolucion y puntos debiles), haz varias consultas.
- Luego razona: interpreta, compara, identifica causas posibles y termina con 1 a 3 recomendaciones concretas.
- Si algo no se puede saber con estos datos, dilo.
- Si la pregunta no tiene relacion con el negocio ni con estos datos, responde en una frase que solo ayudas con esto.
- Responde en espanol de Chile, claro y breve (maximo 180 palabras). Usa parrafos cortos y listas con "- ". Puedes usar **negrita**. No uses tablas ni titulos.`;
}

type Mensaje = { role: string; content?: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]; tool_call_id?: string };

/** Ejecuta el agente: hasta MAX_CONSULTAS rondas de herramientas y una respuesta final redactada por el modelo. */
export async function responderConAgente(pregunta: string, d: Historial, o: OpcionesAgente): Promise<{ ok: true; resultado: Resultado } | { ok: false; fallo: FalloLLM }> {
  if (!o.apiKey) return { ok: false, fallo: 'sin_clave' };
  const modelo = o.modelo || MODELO_POR_DEFECTO;
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 25000);
  const mensajes: Mensaje[] = [{ role: 'system', content: sistema(d) }];
  for (const t of (o.historial ?? []).slice(-3)) {
    mensajes.push({ role: 'user', content: t.pregunta.slice(0, 300) }, { role: 'assistant', content: t.respuesta.slice(0, 600) });
  }
  mensajes.push({ role: 'user', content: pregunta.slice(0, 500) });
  const pasos: Paso[] = [];
  const resultados: string[] = [];
  const herramientas = definirHerramientas(d);

  try {
    for (let ronda = 0; ronda <= MAX_CONSULTAS; ronda++) {
      const ultima = ronda === MAX_CONSULTAS;
      const r = await (o.fetchFn ?? fetch)(URL_GROQ, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${o.apiKey}` },
        body: JSON.stringify({
          model: modelo,
          temperature: 0.2,
          max_tokens: 1200,
          tools: herramientas,
          // En la ultima ronda ya no puede consultar: debe responder con lo que tiene.
          tool_choice: ultima ? 'none' : 'auto',
          ...(modelo.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
          messages: mensajes,
        }),
      });
      if (r.status === 429) return { ok: false, fallo: 'limite' };
      if (!r.ok) return { ok: false, fallo: 'error' };
      const json = (await r.json()) as { choices?: { message?: Mensaje }[] };
      const msg = json.choices?.[0]?.message;
      if (!msg) return { ok: false, fallo: 'sin_respuesta' };
      const llamadas = (msg.tool_calls ?? []).slice(0, 3);

      if (!llamadas.length || ultima) {
        const texto = (msg.content ?? '').trim();
        if (!texto) return { ok: false, fallo: 'sin_respuesta' };
        return {
          ok: true,
          resultado: {
            pregunta, intencion: 'analisis', confianza: 1, alternativas: [], regla: null, origen: `Groq (${modelo})`,
            entidades: { metrica: null, ciudad: null, cliente: null, cobertura: null, marca: null, tienda: null, tiendasPosibles: [], n: null, direccion: null },
            respuesta: { texto, sugerencias: [] },
            analisis: { pasos, verificacion: verificar(texto, resultados) },
          },
        };
      }

      mensajes.push({ role: 'assistant', content: msg.content ?? '', tool_calls: llamadas });
      for (const ll of llamadas) {
        const nombre = HERRAMIENTAS.find((h) => h.nombre === ll.function.name)?.nombre;
        let salida: string;
        if (!nombre) salida = `La herramienta "${ll.function.name}" no existe.`;
        else {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(ll.function.arguments || '{}'); } catch { args = {}; }
          const { e, dim } = argumentosAEntidades(args, d);
          salida = aTexto(ejecutar(nombre, e, d, pregunta, dim));
          const filtros: Record<string, string | number> = {};
          for (const [k, v] of Object.entries({ ...e, tienda: e.tienda?.tienda ?? null, tiendasPosibles: null, dimension: dim ?? null }))
            if (v != null && (typeof v === 'string' || typeof v === 'number')) filtros[k] = v;
          pasos.push({ herramienta: nombre, filtros });
          resultados.push(salida);
        }
        mensajes.push({ role: 'tool', tool_call_id: ll.id, content: salida });
      }
    }
    return { ok: false, fallo: 'sin_respuesta' };
  } catch (err) {
    return { ok: false, fallo: (err as Error)?.name === 'AbortError' ? 'tiempo' : 'error' };
  } finally {
    clearTimeout(reloj);
  }
}
