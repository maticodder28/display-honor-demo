import type { ModeloLenguaje, RespuestaModelo } from '@/aplicacion/puertos';
import type { MensajeChat } from '@/dominio/asistente/agente';

const URL_GROQ = 'https://api.groq.com/openai/v1/chat/completions';

interface Opciones { apiKey: string | undefined; modelo: string; fetchFn?: typeof fetch }

/**
 * Groq con su API compatible con OpenAI. Sin clave devuelve null y el asistente sigue solo con
 * el modelo propio. La clave vive únicamente en el servidor (GROQ_API_KEY en Vercel).
 */
export function crearModeloGroq({ apiKey, modelo, fetchFn = fetch }: Opciones): ModeloLenguaje | null {
  if (!apiKey) return null;
  return {
    nombre: `Groq (${modelo})`,
    async responder(mensajes, herramientas, { forzarTexto, signal }): Promise<RespuestaModelo> {
      try {
        const r = await fetchFn(URL_GROQ, {
          method: 'POST',
          signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: modelo,
            temperature: 0.2,
            max_tokens: 1200,
            tools: herramientas,
            tool_choice: forzarTexto ? 'none' : 'auto',
            // Los modelos gpt-oss razonan antes de responder; con "low" alcanza y es bastante más rápido.
            ...(modelo.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
            messages: mensajes,
          }),
        });
        if (r.status === 429) return { ok: false, fallo: 'limite' };
        if (!r.ok) return { ok: false, fallo: 'error' };
        const json = (await r.json()) as { choices?: { message?: MensajeChat }[] };
        const mensaje = json.choices?.[0]?.message;
        return mensaje ? { ok: true, mensaje } : { ok: false, fallo: 'sin_respuesta' };
      } catch (err) {
        return { ok: false, fallo: (err as Error)?.name === 'AbortError' ? 'tiempo' : 'error' };
      }
    },
  };
}
