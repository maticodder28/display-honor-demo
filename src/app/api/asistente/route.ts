import { NextResponse, type NextRequest } from 'next/server';
import { MODELO_POR_DEFECTO, responderConLLM } from '@/lib/asistente/llm';
import { obtenerHistorial, usuarioActual } from '@/lib/data';

/**
 * Respaldo con LLM del asistente. Solo se llama cuando el motor propio no esta seguro.
 * La clave (GROQ_API_KEY) vive solo en el servidor; si falta, el asistente sigue con el motor propio.
 */
export const dynamic = 'force-dynamic';

const modelo = () => process.env.GROQ_MODEL || MODELO_POR_DEFECTO;

// Limite simple en memoria por visitante. En una funcion serverless cada instancia lleva su propia cuenta:
// sirve para frenar abusos de una demo publica; el tope real lo pone el plan gratuito de Groq.
const VENTANA_MS = 10 * 60 * 1000, POR_VENTANA = 15;
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

/** Estado del respaldo: la interfaz lo usa para saber si vale la pena llamar. */
export async function GET() {
  return NextResponse.json({ disponible: !!process.env.GROQ_API_KEY, modelo: modelo() });
}

export async function POST(req: NextRequest) {
  const usuario = await usuarioActual();
  if (!usuario || usuario.esPromotor) return NextResponse.json({ fallo: 'sin_permiso' }, { status: 401 });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!permitido(ip)) return NextResponse.json({ fallo: 'limite' }, { status: 429 });

  let pregunta = '';
  try { pregunta = String((await req.json())?.pregunta ?? '').trim(); } catch { /* cuerpo invalido */ }
  if (!pregunta || pregunta.length > 300) return NextResponse.json({ fallo: 'pregunta_invalida' }, { status: 400 });

  const datos = await obtenerHistorial();
  const r = await responderConLLM(pregunta, datos, { apiKey: process.env.GROQ_API_KEY, modelo: modelo() });
  if (!r.ok) {
    if (r.fallo !== 'sin_clave') console.warn(`[asistente] respaldo LLM no disponible: ${r.fallo}`);
    return NextResponse.json({ fallo: r.fallo }, { status: r.fallo === 'limite' ? 429 : 503 });
  }
  return NextResponse.json({ resultado: r.resultado });
}
