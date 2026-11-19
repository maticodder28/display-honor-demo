/** Modo demo (NEXT_PUBLIC_DEMO=1): sin Supabase, sin login y con datos ficticios. Ver src/lib/demo.ts. */
export const DEMO = process.env.NEXT_PUBLIC_DEMO === '1';

export const MENSAJE_DEMO = 'Modo demo: los cambios no se guardan. Esta version usa datos ficticios.';
