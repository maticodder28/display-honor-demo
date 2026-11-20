import {
  MAX_CONSULTAS, conversacionInicial, definirHerramientas, ejecutarLlamada, resultadoDelAnalisis,
  type FalloLLM, type MensajeChat, type Paso, type Turno,
} from '@/dominio/asistente/agente';
import type { Resultado } from '@/dominio/asistente/motor';
import type { Historial } from '@/dominio/display/historial';
import type { ModeloLenguaje, RepositorioDisplay, ServicioSesion } from '../puertos';

export type RespuestaAgente = { ok: true; resultado: Resultado } | { ok: false; fallo: FalloLLM };

/**
 * El ciclo del agente: el modelo pide datos, nuestras herramientas responden y se repite hasta
 * MAX_CONSULTAS rondas. En la última ya no puede consultar y tiene que responder con lo que tiene.
 * Todo con un tope de tiempo, porque la función de Vercel corta a los 30 segundos.
 */
export async function responderConAgente(
  pregunta: string,
  datos: Historial,
  llm: ModeloLenguaje | null,
  opciones: { historial?: Turno[]; timeoutMs?: number } = {},
): Promise<RespuestaAgente> {
  if (!llm) return { ok: false, fallo: 'sin_clave' };
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), opciones.timeoutMs ?? 25000);
  const mensajes: MensajeChat[] = conversacionInicial(pregunta, datos, opciones.historial);
  const herramientas = definirHerramientas(datos);
  const pasos: Paso[] = [];
  const consultas: string[] = [];

  try {
    for (let ronda = 0; ronda <= MAX_CONSULTAS; ronda++) {
      const ultima = ronda === MAX_CONSULTAS;
      const r = await llm.responder(mensajes, herramientas, { forzarTexto: ultima, signal: ctrl.signal });
      if (!r.ok) return r;
      // Máximo 3 consultas por ronda, para que no se coma el tiempo en una sola.
      const llamadas = (r.mensaje.tool_calls ?? []).slice(0, 3);

      if (!llamadas.length || ultima) {
        const texto = (r.mensaje.content ?? '').trim();
        return texto
          ? { ok: true, resultado: resultadoDelAnalisis(pregunta, texto, llm.nombre, pasos, consultas) }
          : { ok: false, fallo: 'sin_respuesta' };
      }

      mensajes.push({ role: 'assistant', content: r.mensaje.content ?? '', tool_calls: llamadas });
      for (const ll of llamadas) {
        const { salida, paso } = ejecutarLlamada(ll, datos, pregunta);
        if (paso) { pasos.push(paso); consultas.push(salida); }
        mensajes.push({ role: 'tool', tool_call_id: ll.id, content: salida });
      }
    }
    return { ok: false, fallo: 'sin_respuesta' };
  } finally {
    clearTimeout(reloj);
  }
}

interface Dependencias { repo: RepositorioDisplay; sesion: ServicioSesion; llm: ModeloLenguaje | null; nombreModelo: string }

export type RespuestaPregunta = RespuestaAgente | { ok: false; fallo: 'sin_permiso' | 'pregunta_invalida' };

export function crearCasosAsistente({ repo, sesion, llm, nombreModelo }: Dependencias) {
  return {
    /** La pantalla lo usa para saber si ofrece el modo Groq. */
    estado: () => ({ disponible: !!llm, modelo: nombreModelo }),

    async preguntar(pregunta: string, historial: Turno[]): Promise<RespuestaPregunta> {
      const u = await sesion.usuarioActual();
      if (!u || u.esPromotor) return { ok: false, fallo: 'sin_permiso' };
      const limpia = pregunta.trim();
      if (!limpia || limpia.length > 500) return { ok: false, fallo: 'pregunta_invalida' };
      return responderConAgente(limpia, await repo.historial(), llm, { historial: historial.slice(-3) });
    },
  };
}
