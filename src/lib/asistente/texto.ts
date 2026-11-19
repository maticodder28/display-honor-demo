/** Utilidades de texto del asistente: normalizacion, tokens, raices y distancia de edicion. */

/** Minusculas, sin tildes ni signos; la ñ pasa a n para tolerar teclados sin ella. */
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_%\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const tokens = (s: string) => normalizar(s).split(' ').filter(Boolean);

/** Palabras sin carga para la intencion. Se eliminan antes de clasificar. */
const VACIAS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'en', 'y', 'o', 'a', 'al', 'con', 'por', 'para',
  'que', 'me', 'mi', 'te', 'se', 'lo', 'le', 'es', 'son', 'esta', 'estan', 'este', 'esto', 'eso', 'nos', 'su', 'sus',
  'hay', 'ha', 'han', 'fue', 'ser', 'muy', 'ya', 'si', 'pero', 'como', 'cual', 'cuales', 'cuanto', 'cuanta', 'cuantos',
  'cuantas', 'favor', 'oye', 'hey', 'porfa', 'puedes', 'podrias', 'quiero', 'saber', 'dime', 'decir', 'mostrar',
  'muestrame', 'necesito', 'ver', 'dame', 'sobre', 'tiene', 'tienen', 'tenemos', 'estamos', 'va', 'van', 'vamos',
]);

/** Raiz aproximada: los primeros 5 caracteres. Junta "mejoraron", "mejores" y "mejor". */
export const raiz = (t: string) => (t.startsWith('_') ? t : t.slice(0, 5));

export const significativas = (ts: string[]) => ts.filter((t) => !VACIAS.has(t));

/** Distancia de Levenshtein con corte temprano (solo interesa saber si es <= max). */
export function distancia(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let minFila = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < minFila) minFila = v;
    }
    if (minFila > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Errores de tipeo tolerados segun el largo de la palabra. */
export const toleranciaPara = (largo: number) => (largo >= 8 ? 2 : largo >= 4 ? 1 : 0);

/** Si `palabra` coincide (con errores de tipeo tolerables) con `objetivo`. */
export const parecida = (palabra: string, objetivo: string) =>
  palabra === objetivo || distancia(palabra, objetivo, toleranciaPara(objetivo.length)) <= toleranciaPara(objetivo.length);
