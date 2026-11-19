/**
 * Clasificador de intencion: TF-IDF sobre raices (unigramas y bigramas) + regresion logistica multinomial.
 * Este archivo tiene la representacion y la prediccion; el entrenamiento esta en scripts/entrenar-asistente.ts.
 * No usa librerias de ML: son unas pocas operaciones de algebra lineal.
 */
import { distancia, raiz, significativas } from './texto';

/** Bajo esta confianza el asistente no adivina: dice que no esta seguro y sugiere preguntas. */
export const UMBRAL = 0.45;

export interface Modelo {
  version: number;
  clases: string[];
  vocabulario: string[];
  idf: number[];
  /** Pesos por clase y caracteristica (clases x vocabulario). */
  pesos: number[][];
  sesgo: number[];
}

export interface Prediccion {
  clase: string;
  confianza: number;
  /** Probabilidad de cada clase, de mayor a menor. */
  ranking: { clase: string; p: number }[];
}

/** Caracteristicas de una plantilla: raices y pares de raices consecutivas. */
export function caracteristicas(plantilla: string[]): string[] {
  const rs = significativas(plantilla).map(raiz);
  const out = [...rs];
  for (let i = 0; i + 1 < rs.length; i++) out.push(`${rs[i]}+${rs[i + 1]}`);
  return out;
}

/** Indice de vocabulario con tolerancia a errores de tipeo para palabras desconocidas. */
export function indexador(vocabulario: string[]) {
  const idx = new Map(vocabulario.map((v, i) => [v, i]));
  const simples = vocabulario.filter((v) => !v.includes('+') && !v.startsWith('_') && v.length >= 4);
  const cache = new Map<string, string | null>();
  const corregir = (r: string): string | null => {
    if (idx.has(r)) return r;
    if (cache.has(r)) return cache.get(r)!;
    let mejor: string | null = null;
    if (r.length >= 4 && !r.startsWith('_')) for (const v of simples) if (distancia(r, v, 1) <= 1) { mejor = v; break; }
    cache.set(r, mejor);
    return mejor;
  };
  return (feats: string[]): Map<number, number> => {
    const conteo = new Map<number, number>();
    for (const f of feats) {
      const nombre = f.includes('+') ? f.split('+').map((p) => corregir(p) ?? p).join('+') : corregir(f);
      const i = nombre != null ? idx.get(nombre) : undefined;
      if (i !== undefined) conteo.set(i, (conteo.get(i) ?? 0) + 1);
    }
    return conteo;
  };
}

/** TF-IDF normalizado (L2), como vector disperso. */
export function vectorizar(conteo: Map<number, number>, idf: number[]): Map<number, number> {
  const v = new Map<number, number>();
  let norma = 0;
  conteo.forEach((tf, i) => { const x = (1 + Math.log(tf)) * idf[i]; v.set(i, x); norma += x * x; });
  norma = Math.sqrt(norma) || 1;
  v.forEach((x, i) => v.set(i, x / norma));
  return v;
}

export function softmax(z: number[]): number[] {
  const m = Math.max(...z);
  const e = z.map((x) => Math.exp(x - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}

export function puntajes(v: Map<number, number>, pesos: number[][], sesgo: number[]): number[] {
  return pesos.map((w, c) => { let z = sesgo[c]; v.forEach((x, i) => { z += w[i] * x; }); return z; });
}

/** Crea la funcion de prediccion para un modelo entrenado. */
export function crearClasificador(m: Modelo) {
  const indexar = indexador(m.vocabulario);
  return (plantilla: string[]): Prediccion => {
    const v = vectorizar(indexar(caracteristicas(plantilla)), m.idf);
    const p = softmax(puntajes(v, m.pesos, m.sesgo));
    const ranking = m.clases.map((clase, i) => ({ clase, p: p[i] })).sort((a, b) => b.p - a.p);
    return { clase: ranking[0].clase, confianza: ranking[0].p, ranking };
  };
}
