// Configuración que sale de las variables de entorno. La leen todas las capas, por eso vive en la raíz.

/** Modo demo (NEXT_PUBLIC_DEMO=1): sin Supabase, sin login y con números ficticios. */
export const DEMO = process.env.NEXT_PUBLIC_DEMO === '1';

/** Zona que muestra la app. Hoy es una sola, pero la base ya soporta varias. */
export const ZONA = process.env.NEXT_PUBLIC_ZONA || 'Norte';

export const MENSAJE_DEMO = 'Modo demo: los cambios no se guardan. Esta version usa numeros ficticios.';
