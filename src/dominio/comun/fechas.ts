/**
 * Fecha de hoy en Chile (YYYY-MM-DD). El servidor de Vercel corre en UTC,
 * así que sin la zona horaria después de las 21:00 ya sería "mañana".
 */
export const hoyEnChile = (ahora = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(ahora);

/** Días entre dos fechas YYYY-MM-DD (b - a). */
export const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export const esFechaIso = (f: string) => /^\d{4}-\d{2}-\d{2}$/.test(f);
