/** Intenciones que entiende el asistente, con una pregunta de ejemplo para la interfaz. */
export const INTENCIONES = {
  resumen: { nombre: 'Share de Honor', ejemplo: '¿Cuál es el share de exhibiciones de Honor en La Serena?' },
  lider: { nombre: 'Marca líder', ejemplo: '¿Qué marca lidera en promotores?' },
  ranking_tiendas: { nombre: 'Ranking de tiendas', ejemplo: '¿En qué 5 tiendas está más débil Honor?' },
  tendencia: { nombre: 'Evolución en el tiempo', ejemplo: '¿Cómo ha evolucionado el share de muebles?' },
  cambios_tiendas: { nombre: 'Cambios desde el corte anterior', ejemplo: '¿Qué tiendas bajaron desde el último corte?' },
  por_grupo: { nombre: 'Comparar ciudades o clientes', ejemplo: '¿En qué ciudad está mejor Honor?' },
  detalle_tienda: { nombre: 'Detalle de una tienda', ejemplo: '¿Cómo está la tienda DM105?' },
  sin_levantamiento: { nombre: 'Tiendas sin medición', ejemplo: '¿Qué tiendas no tienen levantamiento de promotores?' },
  ayuda: { nombre: 'Ayuda', ejemplo: '¿Qué te puedo preguntar?' },
  fuera: { nombre: 'Fuera de alcance', ejemplo: '' },
} as const;

export type Intencion = keyof typeof INTENCIONES;

export const PREGUNTAS_EJEMPLO = (Object.keys(INTENCIONES) as Intencion[])
  .filter((k) => k !== 'fuera' && k !== 'ayuda')
  .map((k) => INTENCIONES[k].ejemplo);
