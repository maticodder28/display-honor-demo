/**
 * Extracción de entidades: encuentra en la pregunta la tienda, ciudad, cliente, marca, métrica, cobertura,
 * cantidad y dirección (mejor / peor), comparando contra los valores reales de los datos y tolerando
 * errores de tipeo. Devuelve también la "plantilla": la pregunta con cada entidad reemplazada por un
 * marcador (_ciudad_, _cliente_...), que es lo que ve el clasificador de intención.
 */
import type { Cobertura, Metrica, Tienda } from '@/dominio/display/modelo';
import { parecida, raiz, tokens } from './texto';

export type Direccion = 'mejor' | 'peor';

export interface Entidades {
  metrica: Metrica | null;
  ciudad: string | null;
  cliente: string | null;
  cobertura: Cobertura | null;
  marca: string | null;
  tienda: Tienda | null;
  /** Tiendas que calzan con lo escrito cuando no se puede elegir una sola. */
  tiendasPosibles: Tienda[];
  n: number | null;
  direccion: Direccion | null;
}

export interface Catalogo {
  tiendas: Tienda[];
  marcas: string[];
}

export interface Extraccion {
  entidades: Entidades;
  plantilla: string[];
}

/** Palabras de los nombres de tienda que no distinguen una de otra. */
const GENERICAS = new Set(['sucursal', 'suc', 'tienda', 'local']);

const NUMEROS: Record<string, number> = { dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };

const PEOR = ['peor', 'peore', 'menor', 'menos', 'debil', 'bajo', 'baja', 'bajar', 'bajan', 'bajad', 'empeo', 'perdi', 'perde', 'mal', 'malas', 'malos', 'cayer', 'cayo', 'caida', 'flojo', 'floja', 'reza'];
const MEJOR = ['mejor', 'mayor', 'fuert', 'subie', 'subio', 'suben', 'crec', 'gana', 'ganam', 'top', 'buena', 'bueno', 'alto', 'alta', 'altos', 'altas'];

const uniq = <T,>(a: T[]) => [...new Set(a)];

/** Busca la secuencia `objetivo` (tokens) en `ts` a partir de cualquier posición libre. Devuelve el indice o -1. */
function buscar(ts: string[], usados: boolean[], objetivo: string[]): number {
  for (let i = 0; i + objetivo.length <= ts.length; i++) {
    let ok = true;
    for (let k = 0; k < objetivo.length && ok; k++) ok = !usados[i + k] && parecida(ts[i + k], objetivo[k]);
    if (ok) return i;
  }
  return -1;
}

export function extraer(pregunta: string, cat: Catalogo): Extraccion {
  const ts = tokens(pregunta);
  const usados = ts.map(() => false);
  const marcador: (string | null)[] = ts.map(() => null);
  const marcar = (i: number, largo: number, m: string) => {
    for (let k = 0; k < largo; k++) { usados[i + k] = true; marcador[i + k] = k === 0 ? m : ''; }
  };
  const e: Entidades = { metrica: null, ciudad: null, cliente: null, cobertura: null, marca: null, tienda: null, tiendasPosibles: [], n: null, direccion: null };

  const ciudades = uniq(cat.tiendas.map((t) => t.ciudad));
  const clientes = uniq(cat.tiendas.map((t) => t.cliente));

  // 1. Tienda por código exacto (DM101, APSCL123...), también escrito con espacio ("dm 101").
  const porCodigo = new Map(cat.tiendas.map((t) => [t.codigo.toLowerCase(), t]));
  ts.forEach((t, i) => {
    if (e.tienda || usados[i]) return;
    const junto = porCodigo.get(t + (ts[i + 1] ?? ''));
    if (junto) { e.tienda = junto; marcar(i, 2, '_tienda_'); return; }
    const tienda = porCodigo.get(t);
    if (tienda) { e.tienda = tienda; marcar(i, 1, '_tienda_'); return; }
    // Solo el número del código ("la 255762"), si identifica una única tienda.
    if (/^\d{3,}$/.test(t)) {
      const conNumero = cat.tiendas.filter((x) => x.codigo.toLowerCase().endsWith(t) && /\D/.test(x.codigo.toLowerCase().slice(0, -t.length).slice(-1)));
      if (conNumero.length === 1) { e.tienda = conNumero[0]; marcar(i, 1, '_tienda_'); }
    }
  });

  // 2. Tienda por nombre. Se puntúa cada tienda según cuántas palabras distintivas de su nombre aparecen
  //    (sin contar la ciudad ni palabras genericas como "sucursal"). Los números ("01", "115") suman pero no se exigen.
  //    Si el nombre es solo cadena + ciudad ("RIPLEY LA SERENA"), se exige una palabra como "tienda" o "local":
  //    sin ella, "ripley la serena" se entiende como filtro de cadena y ciudad, que da los mismos números.
  if (!e.tienda) {
    const pide = ts.some((t, i) => !usados[i] && ['tienda', 'local', 'sucursal'].some((p) => parecida(t, p)));
    const candidatas: { t: Tienda; idx: number[]; puntaje: number }[] = [];
    for (const t of cat.tiendas) {
      if (t.cobertura === 'Cerrada') continue;
      const ciu = new Set(tokens(t.ciudad));
      const cli = tokens(t.cliente);
      const dist = tokens(t.tienda).filter((p) => !ciu.has(p) && !GENERICAS.has(p));
      const obligatorias = dist.filter((p) => !/\d/.test(p));
      if (!obligatorias.length) continue;
      const idx: number[] = [];
      let hallados = 0;
      for (const p of dist) {
        const i = ts.findIndex((x, k) => !usados[k] && !idx.includes(k) && parecida(x, p));
        if (i >= 0) { idx.push(i); if (!/\d/.test(p)) hallados++; }
      }
      const fraccion = hallados / obligatorias.length;
      const primera = idx.length > 0 && parecida(ts[idx[0]], obligatorias[0]);
      const soloCadena = obligatorias.length === 1 && cli.includes(obligatorias[0]);
      const conCiudad = tokens(t.ciudad).every((p) => ts.some((x, k) => !usados[k] && parecida(x, p)));
      if (!primera || fraccion < 0.6) continue;
      const conNumero = idx.length > hallados;
      if (soloCadena ? !(conCiudad && (pide || conNumero)) : !(conCiudad || hallados >= 2)) continue;
      candidatas.push({ t, idx, puntaje: idx.length + fraccion + (conCiudad ? 0.5 : 0) });
    }
    if (candidatas.length) {
      const max = Math.max(...candidatas.map((c) => c.puntaje));
      const mejores = candidatas.filter((c) => c.puntaje === max);
      const marcarCiudad = (c: Tienda) => { const j = buscar(ts, usados, tokens(c.ciudad)); if (j >= 0) marcar(j, tokens(c.ciudad).length, ''); };
      if (mejores.length === 1) {
        e.tienda = mejores[0].t;
        mejores[0].idx.forEach((i, k) => marcar(i, 1, k === 0 ? '_tienda_' : ''));
        marcarCiudad(mejores[0].t);
      } else {
        e.tiendasPosibles = mejores.map((c) => c.t);
        mejores[0].idx.forEach((i, k) => marcar(i, 1, k === 0 ? '_tienda_' : ''));
      }
    }
  }

  // 3. Ciudad, cliente y marca (de lo más largo a lo más corto, para que "la serena" gane a palabras sueltas).
  const buscarValor = (valores: string[], m: string): string | null => {
    const orden = [...valores].sort((a, b) => tokens(b).join(' ').length - tokens(a).join(' ').length);
    for (const v of orden) {
      const tv = tokens(v);
      const i = buscar(ts, usados, tv);
      if (i >= 0) { marcar(i, tv.length, m); return v; }
    }
    return null;
  };
  e.ciudad = buscarValor(ciudades, '_ciudad_');
  e.cliente = buscarValor(clientes, '_cliente_');
  e.marca = buscarValor(cat.marcas.filter((m) => m !== 'Honor'), '_marca_');

  // 4. Cobertura: solo cuando se nombra como cobertura (para no confundir "promotores" la métrica).
  ts.forEach((t, i) => {
    if (usados[i]) return;
    const sig = ts[i + 1] ?? '';
    if (t === 'sin' && parecida(sig, 'cobertura')) { e.cobertura = 'Sin cobertura'; marcar(i, 2, '_cobertura_'); }
    else if (parecida(t, 'cobertura') && raiz(sig) === 'promo') { e.cobertura = 'Promotor'; marcar(i, 2, '_cobertura_'); }
    else if (parecida(t, 'middle') || t === 'mm' || parecida(t, 'jefatura')) {
      e.cobertura = 'Middle Management';
      marcar(i, parecida(sig, 'management') ? 2 : 1, '_cobertura_');
    }
  });

  // 5. Métrica.
  ts.forEach((t, i) => {
    if (usados[i]) return;
    const r = raiz(t);
    const sig = ts[i + 1] ?? '';
    let m: Metrica | null = null;
    let largo = 1;
    if (r === 'exhib' || r === 'equip') m = 'exhibiciones';
    else if (r === 'muebl') {
      if (sig === 'dc') { m = 'muebles_dc'; largo = 2; }
      else if (sig === 'dz' || (sig === 'display' && ts[i + 2] === 'zone')) { m = 'muebles_dz'; largo = sig === 'dz' ? 2 : 3; }
      else m = 'muebles';
    } else if (t === 'dz' || (t === 'display' && sig === 'zone')) { m = 'muebles_dz'; largo = t === 'dz' ? 1 : 2; }
    else if (t === 'dc') m = 'muebles_dc';
    else if (r === 'promo' || r === 'vende') m = 'promotores';
    if (m && !e.metrica) { e.metrica = m; marcar(i, largo, '_metrica_'); }
  });

  // 6. Cantidad y dirección. Una palabra de caida gana siempre ("las mayores caídas" es 'peor');
  //    "más" solo cuenta si no hay otra señal.
  let peor = false, mejor = false, mas = false;
  ts.forEach((t, i) => {
    if (usados[i]) return;
    const n = /^\d{1,2}$/.test(t) ? Number(t) : NUMEROS[t];
    if (n && n > 0 && n <= 50 && e.n == null) { e.n = n; marcar(i, 1, '_numero_'); return; }
    const r = raiz(t);
    // Las palabras cortas ("mal", "top") se exigen completas para no confundir "mall" con "mal".
    const calza = (p: string) => (p.length >= 4 ? r.startsWith(p) : t === p);
    if (PEOR.some(calza)) peor = true;
    else if (MEJOR.some(calza)) mejor = true;
    else if (t === 'mas') mas = true;
  });
  e.direccion = peor ? 'peor' : mejor || mas ? 'mejor' : null;

  const plantilla = ts.map((t, i) => (marcador[i] === null ? t : marcador[i]!)).filter(Boolean);
  return { entidades: e, plantilla };
}
