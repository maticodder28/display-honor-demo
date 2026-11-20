const pct1 = new Intl.NumberFormat('es-CL', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct0f = new Intl.NumberFormat('es-CL', { style: 'percent', maximumFractionDigits: 0 });
const int = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });

export const pct = (v: number | null | undefined) => (v == null ? '-' : pct1.format(v).replace(/\s/g, ''));
export const pct0 = (v: number | null | undefined) => (v == null ? '-' : pct0f.format(v).replace(/\s/g, ''));
export const num = (v: number | null | undefined) => (v == null ? '-' : int.format(v));
/** YYYY-MM-DD a DD-MM-YYYY */
export const fdate = (s?: string | null) => (s ? `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}` : '-');
