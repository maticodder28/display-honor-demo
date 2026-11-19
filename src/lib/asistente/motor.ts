/**
 * Motor del asistente: une el extractor de entidades, el clasificador de intencion y las herramientas.
 *
 *   pregunta -> entidades + plantilla -> intencion (con confianza) -> herramienta -> respuesta
 *
 * Funciona sin servidor ni modelos externos: corre completo en el navegador.
 */
import type { Historial } from '../historial';
import { UMBRAL, crearClasificador, type Modelo } from './clasificador';
import { extraer, type Entidades } from './entidades';
import * as H from './herramientas';
import type { Intencion } from './intenciones';
import { raiz, significativas, tokens } from './texto';

/** Como razono el agente: que consultas hizo y cuantas cifras de su respuesta se pudieron verificar. */
export interface Analisis {
  pasos: { herramienta: Intencion; filtros: Record<string, string | number> }[];
  verificacion: { verificadas: number; sinVerificar: string[] };
}

export interface Resultado {
  pregunta: string;
  /** 'analisis' cuando responde el agente con un texto propio. */
  intencion: Intencion | 'analisis';
  confianza: number;
  /** Las tres intenciones mas probables, para mostrar como entendio la pregunta. */
  alternativas: { clase: string; p: number }[];
  entidades: Entidades;
  /** Si la intencion la decidio una regla y no el clasificador. */
  regla: string | null;
  /** Quien resolvio la pregunta: el motor propio o un modelo externo (ej. "Groq openai/gpt-oss-20b"). */
  origen: 'propio' | string;
  respuesta: H.Respuesta;
  analisis?: Analisis;
}

const SALUDOS = new Set(['hola', 'holi', 'buenas', 'buenos', 'dias', 'tardes', 'noches', 'gracias', 'muchas', 'ok', 'okey', 'perfecto', 'genial', 'hey', 'saludos', 'chao', 'adios']);

const DIMENSIONES: Record<string, H.Dimension> = { ciuda: 'ciudad', clien: 'cliente', caden: 'cliente', cober: 'cobertura', middl: 'cobertura' };

/** Cuantos valores distintos de una lista se nombran en la pregunta (ej. "entel, wom y claro"). */
function nombrados(pregunta: string, valores: string[]): number {
  const ts = tokens(pregunta);
  return valores.filter((v) => { const tv = tokens(v); return tv.every((p) => ts.includes(p)); }).length;
}

/** Por que dimension agrupar en "comparar ciudades o clientes". */
function dimension(pregunta: string, e: Entidades, datos: Historial): H.Dimension {
  const rs = tokens(pregunta).map(raiz);
  for (const r of rs) if (DIMENSIONES[r]) return DIMENSIONES[r];
  if (e.cobertura) return 'cobertura';
  if (nombrados(pregunta, [...new Set(datos.tiendas.map((t) => t.cliente))]) > 1) return 'cliente';
  return 'ciudad';
}

/** "por ciudad", "cada cliente", "por cobertura" o varios clientes / ciudades nombrados: es una comparacion entre grupos. */
function pideGrupos(pregunta: string, datos: Historial): boolean {
  const ts = tokens(pregunta).map(raiz);
  if (ts.some((r, i) => (r === 'por' || r === 'cada') && DIMENSIONES[ts[i + 1]])) return true;
  return nombrados(pregunta, [...new Set(datos.tiendas.map((t) => t.cliente))]) > 1
    || nombrados(pregunta, [...new Set(datos.tiendas.map((t) => t.ciudad))]) > 1;
}

/** Ejecuta la herramienta de una intencion. La usan el motor propio y la ruta que consulta a Groq. */
export function ejecutar(intencion: Intencion, e: Entidades, datos: Historial, pregunta: string, dim?: H.Dimension): H.Respuesta {
  if (!datos.cortes.length && intencion !== 'ayuda' && intencion !== 'fuera')
    return { texto: 'Aún no hay datos cargados: cuando se publique el primer Excel podré responder.', sugerencias: [] };
  switch (intencion) {
    case 'resumen': return H.resumen(datos, e);
    case 'lider': return H.lider(datos, e);
    case 'ranking_tiendas': return H.rankingTiendas(datos, e);
    case 'tendencia': return H.tendencia(datos, e);
    case 'cambios_tiendas': return H.cambiosTiendas(datos, e);
    case 'por_grupo': return H.porGrupo(datos, e, dim ?? dimension(pregunta, e, datos));
    case 'detalle_tienda': return H.detalleTienda(datos, e);
    case 'sin_levantamiento': return H.sinLevantamiento(datos, e);
    case 'ayuda': return H.ayuda();
    default: return H.noEntendi();
  }
}

export function crearMotor(modelo: Modelo, datos: Historial) {
  const clasificar = crearClasificador(modelo);
  const catalogo = { tiendas: datos.tiendas, marcas: [...new Set(datos.cortes.flatMap((c) => c.marcas))] };

  return function responder(pregunta: string): Resultado {
    const { entidades: e, plantilla } = extraer(pregunta, catalogo);
    const pred = clasificar(plantilla);
    let intencion = pred.clase as Intencion;
    let regla: string | null = null;

    const palabras = significativas(tokens(pregunta));
    if (palabras.length && palabras.every((p) => SALUDOS.has(p))) { intencion = 'ayuda'; regla = 'saludo'; }
    else if (pideGrupos(pregunta, datos) && intencion !== 'tendencia' && intencion !== 'fuera') { intencion = 'por_grupo'; regla = 'comparación entre grupos'; }
    else if (pred.confianza < UMBRAL) { intencion = 'fuera'; regla = 'confianza baja'; }
    // Si nombra una tienda puntual y pregunta por share o lider, la respuesta util es el detalle de esa tienda.
    else if ((e.tienda || e.tiendasPosibles.length) && (intencion === 'resumen' || intencion === 'lider')) { intencion = 'detalle_tienda'; regla = 'tienda mencionada'; }

    const respuesta = ejecutar(intencion, e, datos, pregunta);
    return { pregunta, intencion, confianza: pred.confianza, alternativas: pred.ranking.slice(0, 3), entidades: e, regla, origen: 'propio', respuesta };
  };
}
