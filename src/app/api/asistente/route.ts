import { NextResponse, type NextRequest } from 'next/server';
import { MODELO_POR_DEFECTO, responderConAgente } from '@/lib/asistente/agente';
import { obtenerHistorial, usuarioActual } from '@/lib/data';

/**
 * Agente del asistente con Groq: razona preguntas abiertas consultando nuestras herramientas.
 * La clave (GROQ_API_KEY) vive solo en el servidor; si falta, el asistente sigue con el modelo propio.
 */
export const dynamic = 'force-dynamic';
// Un analisis puede hacer varias consultas seguidas al modelo.
export const maxDuration = 30;

const modelo = () => process.env.GROQ_MODEL || MODELO_POR_DEFECTO;

// Limite simple en memoria por visitante. En una funcion serverless cada instancia lleva su propia cuenta:
// sirve para frenar abusos de una demo publica; el tope real lo pone el plan gratuito de Groq.
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

/** Estado del agente: la interfaz lo usa para saber si mostrar el modo Groq. */
export async function GET() {
  return NextResponse.json({ disponible: !!process.env.GROQ_API_KEY, modelo: modelo() });
}

export async function POST(req: NextRequest) {
  const usuario = await usuarioActual();
  if (!usuario || usuario.esPromotor) return NextResponse.json({ fallo: 'sin_permiso' }, { status: 401 });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!permitido(ip)) return NextResponse.json({ fallo: 'limite' }, { status: 429 });

  let pregunta = '';
  let historial: { pregunta: string; respuesta: string }[] = [];
  try {
    const body = await req.json();
    pregunta = String(body?.pregunta ?? '').trim();
    if (Array.isArray(body?.historial))
      historial = body.historial.slice(-3)
        .filter((h: unknown): h is { pregunta: string; respuesta: string } => !!h && typeof (h as { pregunta?: unknown }).pregunta === 'string' && typeof (h as { respuesta?: unknown }).respuesta === 'string');
  } catch { /* cuerpo invalido */ }
  if (!pregunta || pregunta.length > 500) return NextResponse.json({ fallo: 'pregunta_invalida' }, { status: 400 });

  const datos = await obtenerHistorial();
  const r = await responderConAgente(pregunta, datos, { apiKey: process.env.GROQ_API_KEY, modelo: modelo(), historial });
  if (!r.ok) {
    if (r.fallo !== 'sin_clave') console.warn(`[asistente] agente no disponible: ${r.fallo}`);
    return NextResponse.json({ fallo: r.fallo }, { status: r.fallo === 'limite' ? 429 : 503 });
  }
  return NextResponse.json({ resultado: r.resultado });
}
