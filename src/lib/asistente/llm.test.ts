import { describe, expect, it } from 'vitest';
import { historialDemo } from '../demo';
import { argumentosAEntidades, definirHerramientas, responderConLLM } from './llm';

const datos = historialDemo();

/** Respuesta falsa de Groq que llama a una herramienta con ciertos argumentos. */
function groqFalso(nombre: string, args: object, capturar?: (init: RequestInit) => void): typeof fetch {
  return (async (_url: string, init: RequestInit) => {
    capturar?.(init);
    return new Response(JSON.stringify({
      choices: [{ message: { tool_calls: [{ function: { name: nombre, arguments: JSON.stringify(args) } }] } }],
    }), { status: 200 });
  }) as unknown as typeof fetch;
}

describe('respaldo con LLM', () => {
  it('sin clave no llama a la red', async () => {
    let llamado = false;
    const r = await responderConLLM('hola', datos, { apiKey: undefined, fetchFn: (async () => { llamado = true; }) as unknown as typeof fetch });
    expect(r).toEqual({ ok: false, fallo: 'sin_clave' });
    expect(llamado).toBe(false);
  });

  it('ejecuta la herramienta elegida con nuestros datos y no con texto del modelo', async () => {
    const r = await responderConLLM('como vamos por alla en el norte chico, en la serena', datos, {
      apiKey: 'clave', fetchFn: groqFalso('resumen', { ciudad: 'la serena', metrica: 'muebles' }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resultado.intencion).toBe('resumen');
    expect(r.resultado.entidades).toMatchObject({ ciudad: 'La Serena', metrica: 'muebles' });
    expect(r.resultado.respuesta.texto).toMatch(/^En La Serena, Honor tiene \*\*[\d,]+%\*\* del share de muebles/);
    expect(r.resultado.origen).toMatch(/^Groq/);
  });

  it('descarta argumentos que no existen en los datos', () => {
    const { e } = argumentosAEntidades({ ciudad: 'Santiago', cliente: 'ENTEL', n: 500, direccion: 'lateral' }, datos, 'pregunta');
    expect(e.ciudad).toBeNull();
    expect(e.cliente).toBe('Entel');
    expect(e.n).toBeNull();
    expect(e.direccion).toBeNull();
  });

  it('manda la clave solo en el encabezado y pide usar una herramienta', async () => {
    let init: RequestInit = {};
    await responderConLLM('pregunta', datos, { apiKey: 'secreta', fetchFn: groqFalso('ayuda', {}, (i) => { init = i; }) });
    const body = JSON.parse(String(init.body));
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secreta');
    expect(String(init.body)).not.toContain('secreta');
    expect(body.tool_choice).toBe('required');
    expect(body.tools.map((t: { function: { name: string } }) => t.function.name)).toContain('ranking_tiendas');
  });

  it('informa el límite de uso, la demora y las respuestas sin herramienta', async () => {
    const limite = (async () => new Response('{}', { status: 429 })) as unknown as typeof fetch;
    expect(await responderConLLM('x', datos, { apiKey: 'k', fetchFn: limite })).toEqual({ ok: false, fallo: 'limite' });

    const lento = ((_u: string, init: RequestInit) => new Promise((_, rechazar) => {
      init.signal?.addEventListener('abort', () => rechazar(Object.assign(new Error('abortado'), { name: 'AbortError' })));
    })) as unknown as typeof fetch;
    expect(await responderConLLM('x', datos, { apiKey: 'k', fetchFn: lento, timeoutMs: 20 })).toEqual({ ok: false, fallo: 'tiempo' });

    expect(await responderConLLM('x', datos, { apiKey: 'k', fetchFn: groqFalso('borrar_todo', {}) })).toEqual({ ok: false, fallo: 'sin_herramienta' });
  });

  it('ofrece al modelo solo valores que existen en los datos', () => {
    const resumen = definirHerramientas(datos).find((t) => t.function.name === 'resumen')!;
    const props = resumen.function.parameters.properties as Record<string, { enum?: string[] }>;
    expect(props.ciudad.enum).toEqual([...new Set(datos.tiendas.map((t) => t.ciudad))].sort());
    expect(props.marca.enum).not.toContain('Honor');
  });
});
