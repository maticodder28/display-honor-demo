import { describe, expect, it } from 'vitest';
import { historialDemo } from '../demo';
import { argumentosAEntidades, cifras, definirHerramientas, responderConAgente, verificar } from './agente';

const datos = historialDemo();

type Respuesta = { content?: string; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] };

/** Groq falso que entrega una respuesta por ronda y guarda lo que recibio. */
function groqFalso(rondas: Respuesta[], recibido: { body: { messages: { role: string; content?: string }[]; tool_choice: string } }[] = []): typeof fetch {
  let i = 0;
  return (async (_url: string, init: RequestInit) => {
    recibido.push(JSON.parse(String(init.body)));
    const msg = rondas[Math.min(i++, rondas.length - 1)];
    return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', ...msg } }] }), { status: 200 });
  }) as unknown as typeof fetch;
}

const llamada = (id: string, name: string, args: object) => ({ id, type: 'function' as const, function: { name, arguments: JSON.stringify(args) } });

describe('verificador de cifras', () => {
  it('normaliza porcentajes y puntos', () => {
    expect(cifras('pasó de 15.4 % a 16,1% (+0,7 pp)')).toEqual(['15,4%', '16,1%', '0,7pp']);
  });
  it('separa cifras verificadas de las que no aparecen en las consultas', () => {
    const v = verificar('Honor tiene 15,4% y Samsung 99,9%.', ['Honor tiene 15,4% del share']);
    expect(v).toEqual({ verificadas: 1, sinVerificar: ['99,9%'] });
  });
});

describe('agente', () => {
  it('sin clave no llama a la red', async () => {
    let llamado = false;
    const r = await responderConAgente('x', datos, { apiKey: undefined, fetchFn: (async () => { llamado = true; }) as unknown as typeof fetch });
    expect(r).toEqual({ ok: false, fallo: 'sin_clave' });
    expect(llamado).toBe(false);
  });

  it('consulta las herramientas, entrega los resultados al modelo y verifica su respuesta', async () => {
    const recibido: { body: never }[] = [];
    const rondas: Respuesta[] = [
      { tool_calls: [llamada('a', 'resumen', { ciudad: 'la serena' }), llamada('b', 'tendencia', {})] },
      { content: 'placeholder' },
    ];
    // La segunda respuesta usa una cifra real (sacada de la consulta) y una inventada.
    const fetchFn = (async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      recibido.push(body as never);
      if (body.messages.some((m: { role: string }) => m.role === 'tool')) {
        const herramienta = body.messages.find((m: { role: string }) => m.role === 'tool').content as string;
        const real = cifras(herramienta)[0];
        rondas[1] = { content: `En La Serena Honor tiene **${real}**.\n\n- Recomendación: reforzar exhibición.\n- Otra cifra: 77,7%.` };
      }
      return groqFalso(rondas.slice(recibido.length - 1))(url, init);
    }) as unknown as typeof fetch;

    const r = await responderConAgente('¿qué opinas de La Serena?', datos, { apiKey: 'k', fetchFn });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resultado.intencion).toBe('analisis');
    expect(r.resultado.analisis!.pasos.map((p) => p.herramienta)).toEqual(['resumen', 'tendencia']);
    expect(r.resultado.analisis!.pasos[0].filtros).toMatchObject({ ciudad: 'La Serena' });
    expect(r.resultado.analisis!.verificacion).toEqual({ verificadas: 1, sinVerificar: ['77,7%'] });
    // El modelo recibio los resultados de nuestras herramientas.
    const segunda = recibido[1] as unknown as { messages: { role: string; content: string }[] };
    expect(segunda.messages.filter((m) => m.role === 'tool')).toHaveLength(2);
    expect(segunda.messages.find((m) => m.role === 'tool')!.content).toContain('En La Serena, Honor tiene');
  });

  it('en la última ronda obliga a responder sin más consultas', async () => {
    const recibido: { tool_choice: string }[] = [];
    const siempreConsulta = (async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      recibido.push(body);
      const msg = body.tool_choice === 'none' ? { content: 'Conclusión con lo que tengo.' } : { tool_calls: [llamada(`c${recibido.length}`, 'resumen', {})] };
      return new Response(JSON.stringify({ choices: [{ message: msg }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await responderConAgente('x', datos, { apiKey: 'k', fetchFn: siempreConsulta });
    expect(r.ok && r.resultado.respuesta.texto).toBe('Conclusión con lo que tengo.');
    expect(recibido.at(-1)!.tool_choice).toBe('none');
    expect(recibido).toHaveLength(6);
  });

  it('incluye la conversación previa para preguntas de seguimiento', async () => {
    const recibido: { messages: { role: string; content?: string }[] }[] = [];
    await responderConAgente('¿y en Ovalle?', datos, {
      apiKey: 'k', fetchFn: groqFalso([{ content: 'ok' }], recibido as never),
      historial: [{ pregunta: '¿cómo vamos en Coquimbo?', respuesta: 'Bien.' }],
    });
    expect(recibido[0].messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
  });

  it('informa límite de uso y demora', async () => {
    const limite = (async () => new Response('{}', { status: 429 })) as unknown as typeof fetch;
    expect(await responderConAgente('x', datos, { apiKey: 'k', fetchFn: limite })).toEqual({ ok: false, fallo: 'limite' });
    const lento = ((_u: string, init: RequestInit) => new Promise((_, rechazar) => {
      init.signal?.addEventListener('abort', () => rechazar(Object.assign(new Error('abortado'), { name: 'AbortError' })));
    })) as unknown as typeof fetch;
    expect(await responderConAgente('x', datos, { apiKey: 'k', fetchFn: lento, timeoutMs: 20 })).toEqual({ ok: false, fallo: 'tiempo' });
  });

  it('descarta argumentos que no existen en los datos y solo ofrece valores reales', () => {
    const { e } = argumentosAEntidades({ ciudad: 'Santiago', cliente: 'ENTEL', n: 500 }, datos);
    expect(e).toMatchObject({ ciudad: null, cliente: 'Entel', n: null });
    const props = definirHerramientas(datos)[0].function.parameters.properties as Record<string, { enum?: string[] }>;
    expect(props.ciudad.enum).toEqual([...new Set(datos.tiendas.map((t) => t.ciudad))].sort());
  });
});
