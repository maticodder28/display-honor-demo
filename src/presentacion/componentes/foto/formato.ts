// Formatos de la Foto del Éxito. El cumplimiento se pinta verde desde 70% y amarillo desde 40%.

export const pct = (x: number | null) => (x == null ? '-' : `${Math.round(x * 100)}%`);
export const claseCumplimiento = (x: number | null) => (x == null ? 's-mut' : x >= 0.7 ? 's-ok' : x >= 0.4 ? 's-warn' : 's-bad');

/** Diferencia en puntos porcentuales: "+3 pp", "-2 pp" o "0 pp". */
export function pp(d: number) {
  const v = Math.round(d * 100);
  return `${v > 0 ? '+' : v < 0 ? '-' : ''}${Math.abs(v)} pp`;
}
export const claseDelta = (d: number) => (Math.round(d * 100) > 0 ? 's-ok' : Math.round(d * 100) < 0 ? 's-bad' : 's-mut');
export const coberturaCorta = (c: string) => (c === 'Middle Management' ? 'Middle Mgmt' : c);
/** "ENTEL QUINTEL LA SERENA" -> "LA SERENA", para que la lista de faltantes quepa en la tarjeta. */
export const nombreSinCadena = (t: string) => t.replace(/^ENTEL\s+(QUINTEL|AUSTRAL)\s+/i, '');

export type Estado = { ok: boolean; texto: string } | null;
