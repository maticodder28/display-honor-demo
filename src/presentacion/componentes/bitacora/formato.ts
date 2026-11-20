// Cómo se ve cada cosa en la bitácora: etiquetas, colores y formatos. Las reglas están en dominio/bitacora.

import type { Nivel, TipoAccion } from '@/dominio/bitacora/bitacora';

export const TIPOS: { id: TipoAccion; label: string; color: string; placeholder: string }[] = [
  { id: 'visita', label: 'Visita', color: '#60a5fa', placeholder: 'Qué se revisó: exhibición, stock, precios, material POP...' },
  { id: 'venta', label: 'Venta ejecutivo', color: '#22c55e', placeholder: 'Opcional: modelos vendidos, período (ej. semana 41)...' },
  { id: 'incentivo', label: 'Incentivo / regalo', color: '#ff7a1a', placeholder: 'Qué se entregó y por qué (ej. audífonos por meta mensual)...' },
  { id: 'capacitacion', label: 'Capacitación', color: '#2dd4bf', placeholder: 'Producto o tema y cuántos ejecutivos asistieron...' },
  { id: 'implementacion', label: 'Implementación', color: '#a78bfa', placeholder: 'Mueble, demo o material instalado o corregido...' },
  { id: 'observacion', label: 'Observación', color: '#eab308', placeholder: 'Algo a tener en cuenta: quiebre de stock, competencia, reclamo...' },
];
export const TIPO = Object.fromEntries(TIPOS.map((t) => [t.id, t])) as Record<string, (typeof TIPOS)[number]>;

export const COLORES_USUARIO = ['#ff7a1a', '#60a5fa', '#2dd4bf', '#a78bfa', '#f472b6', '#eab308'];
export const NIVEL_CLASE: Record<Nivel, string> = { Alto: 'ok', Medio: 'warn', Bajo: 'bad', 'Sin ventas': 'mut' };

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
/** "2026-11-09" -> "9 nov" */
export const fechaCorta = (f: string) => `${Number(f.slice(8, 10))} ${MES_CORTO[Number(f.slice(5, 7)) - 1]}`;
/** "2026-11" -> "noviembre 2026" */
export const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
export const mesCorto = (m: string) => MES_CORTO[Number(m.slice(5, 7)) - 1];
export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export interface Persona { nombre: string; cargo: string; color: string; ini: string }
export const PERSONA_DESCONOCIDA: Persona = { nombre: 'Usuario', cargo: '', color: '#8d8d98', ini: '?' };

export type Aviso = { ok: boolean; texto: string } | null;
