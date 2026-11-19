/**
 * Preguntas escritas a mano para evaluar el asistente. No salen de las plantillas de entrenamiento:
 * usan otras palabras y otro orden, como las escribiria alguien del equipo. Algunas indican tambien
 * las entidades esperadas, para probar el extractor.
 */
import type { Intencion } from './intenciones';

export interface PreguntaEvaluacion {
  pregunta: string;
  intencion: Intencion;
  entidades?: { ciudad?: string; cliente?: string; marca?: string; metrica?: string; tienda?: string; direccion?: 'mejor' | 'peor'; n?: number; cobertura?: string };
}

export const PREGUNTAS_EVALUACION: PreguntaEvaluacion[] = [
  // Share de Honor
  { pregunta: 'como andamos en coquimbo', intencion: 'resumen', entidades: { ciudad: 'Coquimbo' } },
  { pregunta: 'Qué % de los muebles son nuestros en Falabella?', intencion: 'resumen', entidades: { cliente: 'Falabella', metrica: 'muebles' } },
  { pregunta: 'necesito el share actual de exhibición', intencion: 'resumen', entidades: { metrica: 'exhibiciones' } },
  { pregunta: 'honor contra xiaomi en ovalle', intencion: 'resumen', entidades: { marca: 'Xiaomi', ciudad: 'Ovalle' } },
  { pregunta: 'cuánto pesa honor en los muebles display zone de paris', intencion: 'resumen', entidades: { cliente: 'Paris', metrica: 'muebles_dz' } },
  { pregunta: 'estamos muy lejos de samsung?', intencion: 'resumen', entidades: { marca: 'Samsung' } },
  { pregunta: 'participacion en vallenar', intencion: 'resumen', entidades: { ciudad: 'Vallenar' } },
  { pregunta: 'cual es nuestro porcentaje de promotores en tiendas middle', intencion: 'resumen', entidades: { metrica: 'promotores', cobertura: 'Middle Management' } },
  { pregunta: 'y en copiapo como estamos', intencion: 'resumen', entidades: { ciudad: 'Copiapó' } },
  { pregunta: 'share honor ripley', intencion: 'resumen', entidades: { cliente: 'Ripley' } },

  // Marca lider
  { pregunta: 'quien manda en la serena', intencion: 'lider', entidades: { ciudad: 'La Serena' } },
  { pregunta: 'que marca tiene mas vendedores en las tiendas', intencion: 'lider', entidades: { metrica: 'promotores' } },
  { pregunta: 'en qué lugar quedamos en exhibición en Entel', intencion: 'lider', entidades: { cliente: 'Entel', metrica: 'exhibiciones' } },
  { pregunta: 'quien es la marca numero uno en muebles', intencion: 'lider', entidades: { metrica: 'muebles' } },
  { pregunta: 'cómo quedaron las posiciones de las marcas en hites', intencion: 'lider', entidades: { cliente: 'Hites' } },
  { pregunta: 'que puesto tenemos en wom', intencion: 'lider', entidades: { cliente: 'WOM' } },
  { pregunta: 'quien nos esta ganando en movistar', intencion: 'lider', entidades: { cliente: 'Movistar' } },
  { pregunta: 'marca dominante en ovalle', intencion: 'lider', entidades: { ciudad: 'Ovalle' } },

  // Ranking de tiendas
  { pregunta: 'las 3 tiendas mas flojas de la serena', intencion: 'ranking_tiendas', entidades: { n: 3, ciudad: 'La Serena', direccion: 'peor' } },
  { pregunta: 'donde tenemos el share mas alto', intencion: 'ranking_tiendas', entidades: { direccion: 'mejor' } },
  { pregunta: 'en cuales tiendas samsung nos supera', intencion: 'ranking_tiendas', entidades: { marca: 'Samsung' } },
  { pregunta: 'Top 10 tiendas en exhibición', intencion: 'ranking_tiendas', entidades: { n: 10, metrica: 'exhibiciones', direccion: 'mejor' } },
  { pregunta: 'tiendas donde hay que poner mas foco', intencion: 'ranking_tiendas' },
  { pregunta: 'cuales son nuestras tiendas fuertes en entel', intencion: 'ranking_tiendas', entidades: { cliente: 'Entel', direccion: 'mejor' } },
  { pregunta: 'tiendas con peor participacion de muebles', intencion: 'ranking_tiendas', entidades: { metrica: 'muebles', direccion: 'peor' } },
  { pregunta: 'en que tiendas somos primeros', intencion: 'ranking_tiendas' },
  { pregunta: 'peores 5 tiendas de copiapó', intencion: 'ranking_tiendas', entidades: { n: 5, ciudad: 'Copiapó', direccion: 'peor' } },
  { pregunta: 'locales con menos equipos honor', intencion: 'ranking_tiendas', entidades: { direccion: 'peor', metrica: 'exhibiciones' } },

  // Tendencia
  { pregunta: 'vamos para arriba o para abajo?', intencion: 'tendencia' },
  { pregunta: 'como ha sido la evolucion de los promotores', intencion: 'tendencia', entidades: { metrica: 'promotores' } },
  { pregunta: 'cuanto crecimos en coquimbo desde que empezamos a medir', intencion: 'tendencia', entidades: { ciudad: 'Coquimbo' } },
  { pregunta: 'historico de share en falabella', intencion: 'tendencia', entidades: { cliente: 'Falabella' } },
  { pregunta: 'el share de muebles subio o bajo en el ultimo tiempo', intencion: 'tendencia', entidades: { metrica: 'muebles' } },
  { pregunta: 'quiero ver la tendencia de honor en la serena', intencion: 'tendencia', entidades: { ciudad: 'La Serena' } },
  { pregunta: 'hemos mejorado con los meses?', intencion: 'tendencia' },
  { pregunta: 'evolucion corte por corte', intencion: 'tendencia' },

  // Cambios desde el corte anterior
  { pregunta: 'que locales empeoraron esta vez', intencion: 'cambios_tiendas', entidades: { direccion: 'peor' } },
  { pregunta: 'donde perdimos participacion vs la medicion pasada', intencion: 'cambios_tiendas', entidades: { direccion: 'peor' } },
  { pregunta: 'cuantas tiendas subieron en el ultimo levantamiento', intencion: 'cambios_tiendas', entidades: { direccion: 'mejor' } },
  { pregunta: 'que cambio entre el corte de antes y el de ahora', intencion: 'cambios_tiendas' },
  { pregunta: 'tiendas que mejoraron en muebles', intencion: 'cambios_tiendas', entidades: { metrica: 'muebles', direccion: 'mejor' } },
  { pregunta: 'cuales bajaron en ovalle', intencion: 'cambios_tiendas', entidades: { ciudad: 'Ovalle', direccion: 'peor' } },
  { pregunta: 'variacion por local respecto a la ultima vez', intencion: 'cambios_tiendas' },
  { pregunta: 'las mayores caidas del ultimo corte', intencion: 'cambios_tiendas', entidades: { direccion: 'peor' } },

  // Comparar ciudades o clientes
  { pregunta: 'que ciudad esta mas debil', intencion: 'por_grupo', entidades: { direccion: 'peor' } },
  { pregunta: 'share de cada cadena', intencion: 'por_grupo' },
  { pregunta: 'como nos va por ciudad en promotores', intencion: 'por_grupo', entidades: { metrica: 'promotores' } },
  { pregunta: 'cual es nuestra mejor cadena', intencion: 'por_grupo', entidades: { direccion: 'mejor' } },
  { pregunta: 'comparame entel, wom y claro', intencion: 'por_grupo' },
  { pregunta: 'en que cliente tenemos mas exhibicion', intencion: 'por_grupo', entidades: { metrica: 'exhibiciones', direccion: 'mejor' } },
  { pregunta: 'middle vs promotor, donde rendimos mejor', intencion: 'por_grupo' },
  { pregunta: 'ciudades ordenadas por share', intencion: 'por_grupo' },

  // Detalle de una tienda
  { pregunta: 'dm110', intencion: 'detalle_tienda', entidades: { tienda: 'DM110' } },
  { pregunta: 'como esta la DM105', intencion: 'detalle_tienda', entidades: { tienda: 'DM105' } },
  { pregunta: 'info de ripley portal coquimbo', intencion: 'detalle_tienda', entidades: { tienda: 'DM106' } },
  { pregunta: 'que onda la tienda DM120', intencion: 'detalle_tienda', entidades: { tienda: 'DM120' } },
  { pregunta: 'necesito los numeros de entel centro la serena', intencion: 'detalle_tienda', entidades: { tienda: 'DM101' } },
  { pregunta: 'dm 101 como va', intencion: 'detalle_tienda' },
  { pregunta: 'quien lidera en la DM112', intencion: 'detalle_tienda', entidades: { tienda: 'DM112' } },

  // Tiendas sin medicion
  { pregunta: 'cuales no se han medido', intencion: 'sin_levantamiento' },
  { pregunta: 'falta levantar alguna tienda?', intencion: 'sin_levantamiento' },
  { pregunta: 'tiendas pendientes de medir en copiapo', intencion: 'sin_levantamiento', entidades: { ciudad: 'Copiapó' } },
  { pregunta: 'en que locales no tenemos datos de promotores', intencion: 'sin_levantamiento', entidades: { metrica: 'promotores' } },
  { pregunta: 'cuantas tiendas quedaron sin levantamiento', intencion: 'sin_levantamiento' },

  // Ayuda
  { pregunta: 'hola!', intencion: 'ayuda' },
  { pregunta: 'que cosas te puedo preguntar', intencion: 'ayuda' },
  { pregunta: 'como funciona este asistente', intencion: 'ayuda' },
  { pregunta: 'buenas tardes', intencion: 'ayuda' },
  { pregunta: 'gracias!!', intencion: 'ayuda' },

  // Fuera de alcance
  { pregunta: 'cuanto cuesta un honor 600', intencion: 'fuera' },
  { pregunta: 'va a llover el fin de semana?', intencion: 'fuera' },
  { pregunta: 'hazme un resumen del partido de colo colo', intencion: 'fuera' },
  { pregunta: 'escribeme un mensaje para pedir vacaciones', intencion: 'fuera' },
  { pregunta: 'cual es el mejor celular para comprar', intencion: 'fuera' },
  { pregunta: 'quien invento el telefono', intencion: 'fuera' },
];
