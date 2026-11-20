import { NextResponse, type NextRequest } from 'next/server';
import type { Turno } from '@/dominio/asistente/agente';
import { contenedor } from '@/infraestructura/contenedor';

// Endpoint del modo Groq del asistente. Acá solo se valida el pedido y se limita el uso;
// el agente en sí es un caso de uso (aplicacion/casos-de-uso/asistente.ts).
export const dynamic = 'force-dynamic';
// Un análisis puede hacer varias consultas seguidas al modelo.
export const maxDuration = 30;

// Límite simple en memoria por visitante. En serverless cada instancia lleva su propia cuenta,
// así que sirve para frenar abusos de la demo pública; el tope real lo pone el plan gratuito de Groq.
const VENTANA_MS = 10 * 60 * 1000, POR_VENTANA = 8;
const visitas = new Map<string, number[]>();
function permitido(ip: string): boolean {
  const ahora = Date.now();
  const lista = (visitas.get(ip) ?? []).filter((t) => ahora - t < VENTANA_MS);
  if (lista.length >= POR_VENTANA) { visitas.set(ip, lista); return false; }
  lista.push(ahora);
  visitas.set(ip, lista);
  if (visitas.size > 5000) visitas.clear();
  return true;
}

const esTurno = (h: unknown): h is Turno =>
  !!h && typeof (h as Turno).pregunta === 'string' && typeof (h as Turno).respuesta === 'string';

const ESTADO_HTTP: Record<string, number> = { sin_permiso: 401, pregunta_invalida: 400, limite: 429 };

export async function GET() {
  return NextResponse.json(contenedor().asistente.estado());
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!permitido(ip)) return NextResponse.json({ fallo: 'limite' }, { status: 429 });

  let pregunta = '';
  let historial: Turno[] = [];
  try {
    const body = await req.json();
    pregunta = String(body?.pregunta ?? '');
    if (Array.isArray(body?.historial)) historial = body.historial.slice(-3).filter(esTurno);
  } catch { /* cuerpo inválido: queda la pregunta vacía y el caso de uso la rechaza */ }

  const r = await contenedor().asistente.preguntar(pregunta, historial);
  if (r.ok) return NextResponse.json({ resultado: r.resultado });
  if (r.fallo !== 'sin_clave' && r.fallo !== 'sin_permiso' && r.fallo !== 'pregunta_invalida') console.warn(`[asistente] agente no disponible: ${r.fallo}`);
  return NextResponse.json({ fallo: r.fallo }, { status: ESTADO_HTTP[r.fallo] ?? 503 });
}
