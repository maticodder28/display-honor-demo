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

export interface Resultado {
  pregunta: string;
  intencion: Intencion;
  confianza: number;
  /** Las tres intenciones mas probables, para mostrar como entendio la pregunta. */
  alternativas: { clase: string; p: number }[];
  entidades: Entidades;
  /** Si la intencion la decidio una regla y no el clasificador. */
  regla: string | null;
  respuesta: H.Respuesta;
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

    if (!datos.cortes.length) {
      return { pregunta, intencion, confianza: pred.confianza, alternativas: pred.ranking.slice(0, 3), entidades: e, regla,
        respuesta: { texto: 'Aún no hay datos cargados: cuando se publique el primer Excel podré responder.', sugerencias: [] } };
    }

    const respuesta: H.Respuesta =
      intencion === 'resumen' ? H.resumen(datos, e)
      : intencion === 'lider' ? H.lider(datos, e)
      : intencion === 'ranking_tiendas' ? H.rankingTiendas(datos, e)
      : intencion === 'tendencia' ? H.tendencia(datos, e)
      : intencion === 'cambios_tiendas' ? H.cambiosTiendas(datos, e)
      : intencion === 'por_grupo' ? H.porGrupo(datos, e, dimension(pregunta, e, datos))
      : intencion === 'detalle_tienda' ? H.detalleTienda(datos, e)
      : intencion === 'sin_levantamiento' ? H.sinLevantamiento(datos, e)
      : intencion === 'ayuda' ? H.ayuda()
      : H.noEntendi();

    return { pregunta, intencion, confianza: pred.confianza, alternativas: pred.ranking.slice(0, 3), entidades: e, regla, respuesta };
  };
}
