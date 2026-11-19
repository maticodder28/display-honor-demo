'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Modelo } from '@/lib/asistente/clasificador';
import type { Respuesta } from '@/lib/asistente/herramientas';
import { INTENCIONES, PREGUNTAS_EJEMPLO, type Intencion } from '@/lib/asistente/intenciones';
import modelo from '@/lib/asistente/modelo.json';
import { crearMotor, type Resultado } from '@/lib/asistente/motor';
import type { Historial } from '@/lib/historial';
import { metricaNombre } from '@/lib/types';

/** Texto con **negritas**. */
function Rico({ texto }: { texto: string }) {
  const partes = texto.split(/\*\*(.+?)\*\*/g);
  return <>{partes.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p))}</>;
}

/** Markdown minimo para las respuestas del agente: parrafos, listas con "- " o "1." y **negritas**. */
function TextoLargo({ texto }: { texto: string }) {
  const bloques = texto.replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.split('\n').filter((l) => l.trim()));
  return (
    <div className="as-largo">
      {bloques.map((lineas, i) => {
        const esLista = lineas.every((l) => /^\s*([-*\u2022]|\d+[.)])\s+/.test(l));
        if (esLista) {
          const numerada = /^\s*\d/.test(lineas[0]);
          const items = lineas.map((l, j) => <li key={j}><Rico texto={l.replace(/^\s*([-*\u2022]|\d+[.)])\s+/, '')} /></li>);
          return numerada ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>;
        }
        return <p key={i}>{lineas.map((l, j) => <span key={j}>{j > 0 && <br />}<Rico texto={l.replace(/^#+\s*/, '')} /></span>)}</p>;
      })}
    </div>
  );
}

function MiniGrafico({ serie }: { serie: NonNullable<Respuesta['serie']> }) {
  const vals = serie.valores.map((v) => v ?? null);
  const nums = vals.filter((v): v is number => v != null);
  if (nums.length < 2) return null;
  const min = Math.min(...nums), max = Math.max(...nums), rango = max - min || 1;
  const W = 320, H = 70, P = 6;
  const x = (i: number) => P + (i * (W - 2 * P)) / (vals.length - 1);
  const y = (v: number) => H - P - ((v - min) / rango) * (H - 2 * P);
  const pts = vals.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean).join(' ');
  const f = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')}%`;
  return (
    <figure className="as-graf">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Evolución del share: de ${f(nums[0])} a ${f(nums[nums.length - 1])}`}>
        <polyline points={pts} fill="none" stroke="var(--acc)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {vals.map((v, i) => (v == null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={i === vals.length - 1 ? 4 : 2.5} fill="var(--acc)" />))}
      </svg>
      <figcaption><span>{serie.etiquetas[0]}</span><span>{serie.etiquetas[serie.etiquetas.length - 1]}</span></figcaption>
    </figure>
  );
}

const nombreIntencion = (c: string) => INTENCIONES[c as Intencion]?.nombre ?? c;

/** Como entendio la pregunta el modelo propio. */
function Entendi({ r }: { r: Resultado }) {
  const e = r.entidades;
  const chips: [string, string][] = [];
  if (e.tienda) chips.push(['Tienda', `${e.tienda.tienda} (${e.tienda.codigo})`]);
  if (e.ciudad) chips.push(['Ciudad', e.ciudad]);
  if (e.cliente) chips.push(['Cliente', e.cliente]);
  if (e.cobertura) chips.push(['Cobertura', e.cobertura]);
  if (e.marca) chips.push(['Marca', e.marca]);
  if (e.metrica) chips.push(['Métrica', metricaNombre(e.metrica)]);
  if (e.n) chips.push(['Cantidad', String(e.n)]);
  if (e.direccion) chips.push(['Orden', e.direccion === 'peor' ? 'de menor a mayor' : 'de mayor a menor']);
  const conDatos = r.intencion !== 'fuera' && r.intencion !== 'ayuda';
  return (
    <details className="as-ent">
      <summary>Cómo lo entendí</summary>
      <div className="as-ent-c">
        <p>
          Intención: <b>{nombreIntencion(r.intencion)}</b>
          {r.regla ? <> (regla: {r.regla})</> : <> con {Math.round(r.confianza * 100)}% de confianza</>}
        </p>
        <p className="s-mut">Resuelta por el modelo propio. Alternativas: {r.alternativas.map((a) => `${nombreIntencion(a.clase)} ${Math.round(a.p * 100)}%`).join(' | ')}</p>
        {conDatos && (chips.length
          ? <ul className="as-chips">{chips.map(([k, v]) => <li key={k}><span>{k}</span>{v}</li>)}</ul>
          : <p className="s-mut">Sin filtros: toda la zona, métrica exhibiciones.</p>)}
      </div>
    </details>
  );
}

/** Como razono el agente: consultas hechas y verificacion de cifras. */
function Razono({ r }: { r: Resultado }) {
  const a = r.analisis!;
  const { verificadas, sinVerificar } = a.verificacion;
  return (
    <details className="as-ent">
      <summary>Cómo lo razonó</summary>
      <div className="as-ent-c">
        <p>{r.origen} hizo <b>{a.pasos.length} {a.pasos.length === 1 ? 'consulta' : 'consultas'}</b> a los datos de la app y redactó el análisis.</p>
        {a.pasos.length > 0 && (
          <ol className="as-pasos">
            {a.pasos.map((p, i) => (
              <li key={i}>
                <b>{nombreIntencion(p.herramienta)}</b>
                {Object.keys(p.filtros).length > 0 && <span className="s-mut"> | {Object.entries(p.filtros).map(([k, v]) => `${k}: ${v}`).join(', ')}</span>}
              </li>
            ))}
          </ol>
        )}
        <p className={sinVerificar.length ? 's-warn' : 's-ok'}>
          {verificadas + sinVerificar.length === 0
            ? 'La respuesta no cita porcentajes.'
            : sinVerificar.length
              ? `${verificadas} cifras verificadas contra las consultas; sin verificar: ${sinVerificar.join(', ')} (puede ser un cálculo propio del modelo).`
              : `Las ${verificadas} cifras de la respuesta aparecen en las consultas.`}
        </p>
      </div>
    </details>
  );
}

interface Item { id: number; r: Resultado; consultando?: boolean; aviso?: string }

type Modo = 'auto' | 'propio' | 'groq';
const MODOS: [Modo, string, string][] = [
  ['auto', 'Automático', 'Responde el modelo propio; si no está seguro, Groq razona la respuesta'],
  ['propio', 'Solo modelo propio', 'Nunca consulta a Groq'],
  ['groq', 'Groq', 'Groq razona cada pregunta con los datos: sirve para preguntas abiertas'],
];

const PREGUNTAS_ABIERTAS = [
  '¿Qué opinas de nuestro panorama como empresa?',
  '¿Dónde debería enfocar el trabajo esta semana?',
  '¿Por qué crees que estamos débiles en La Serena?',
  '¿Qué cambió en el último corte y qué hago al respecto?',
];

const AVISOS: Record<string, string> = {
  limite: 'Groq llegó a su límite de uso por ahora; respondió el modelo propio.',
  tiempo: 'Groq tardó demasiado; respondió el modelo propio.',
};

function Mensaje({ item }: { item: Item }) {
  const { r } = item;
  const t = r.respuesta.tabla;
  if (item.consultando) {
    return (
      <article className="as-msg">
        <p className="as-yo">{r.pregunta}</p>
        <div className="card as-resp" aria-busy="true">
          <p className="as-txt s-mut">{r.regla === 'confianza baja' ? 'El modelo propio no está seguro: Groq está analizando los datos...' : 'Groq está analizando los datos...'}</p>
        </div>
      </article>
    );
  }
  return (
    <article className="as-msg">
      <p className="as-yo">{r.pregunta}</p>
      <div className="card as-resp">
        {item.aviso && <p className="as-txt s-mut">{item.aviso}</p>}
        {r.analisis ? (
          <>
            <span className="as-ia">Análisis generado por IA con datos de la app</span>
            <TextoLargo texto={r.respuesta.texto} />
            <Razono r={r} />
          </>
        ) : (
          <>
            <p className="as-txt"><Rico texto={r.respuesta.texto} /></p>
            {r.respuesta.serie && <MiniGrafico serie={r.respuesta.serie} />}
            {t && (
              <div className="scroll as-tab">
                <table className="det">
                  <thead><tr>{t.columnas.map((c, i) => <th key={c} className={t.alinear[i] === 'l' ? 'l' : undefined}>{c}</th>)}</tr></thead>
                  <tbody>
                    {t.filas.map((f, i) => (
                      <tr key={i}>{f.map((v, j) => <td key={j} className={t.alinear[j] === 'l' ? 'l' : undefined}>{v}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Entendi r={r} />
          </>
        )}
      </div>
    </article>
  );
}

export default function Asistente({ datos }: { datos: Historial }) {
  const responder = useMemo(() => crearMotor(modelo as Modelo, datos), [datos]);
  const [conversacion, setConversacion] = useState<Item[]>([]);
  const [llm, setLlm] = useState<{ disponible: boolean; modelo: string } | null>(null);
  const [modo, setModo] = useState<Modo>('auto');
  const [texto, setTexto] = useState('');
  const fin = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/asistente').then((r) => (r.ok ? r.json() : null)).then(setLlm).catch(() => setLlm(null));
  }, []);
  useEffect(() => { if (conversacion.length) fin.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [conversacion.length]);

  const preguntar = async (q: string) => {
    const p = q.trim();
    if (!p) return;
    const local = responder(p);
    // En modo automatico, Groq solo entra cuando el modelo propio no esta seguro: ahorra cuota y responde al instante.
    const usarLLM = !!llm?.disponible && (modo === 'groq' || (modo === 'auto' && local.regla === 'confianza baja'));
    const id = Date.now() + Math.random();
    // Contexto para preguntas de seguimiento ("¿y en Ovalle?").
    const historial = conversacion.filter((x) => !x.consultando).slice(-3).map((x) => ({ pregunta: x.r.pregunta, respuesta: x.r.respuesta.texto }));
    setConversacion((c) => [...c, { id, r: local, consultando: usarLLM }].slice(-30));
    setTexto('');
    entrada.current?.focus();
    if (!usarLLM) return;
    let item: Item = { id, r: local };
    try {
      const res = await fetch('/api/asistente', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pregunta: p, historial }) });
      const json = await res.json();
      item = json.resultado ? { id, r: json.resultado as Resultado } : { id, r: local, aviso: AVISOS[json.fallo] || 'Groq no está disponible en este momento; respondió el modelo propio.' };
    } catch {
      item = { id, r: local, aviso: 'Groq no está disponible en este momento; respondió el modelo propio.' };
    }
    setConversacion((c) => c.map((x) => (x.id === id ? item : x)));
  };

  const ultima = conversacion[conversacion.length - 1];
  const sugerencias = ultima && !ultima.consultando && ultima.r.respuesta.sugerencias.length
    ? ultima.r.respuesta.sugerencias
    : modo === 'groq' ? PREGUNTAS_ABIERTAS : PREGUNTAS_EJEMPLO;

  return (
    <div className="as">
      <header className="top">
        <div>
          <h1>Asistente</h1>
          <p className="sub">
            Pregúntale a los datos del Display en lenguaje natural. El modelo propio (un clasificador y un extractor de
            entidades) corre en tu navegador y responde con los mismos cálculos del dashboard.
          </p>
          <p className="sub">
            {llm?.disponible
              ? <>Con <b>Groq</b> ({llm.modelo}) puedes hacer preguntas abiertas: un agente consulta los datos, razona y redacta un análisis, y se verifica cada cifra que cita.</>
              : <>Groq no está configurado: todo se resuelve con el modelo propio.</>}
          </p>
        </div>
        {conversacion.length > 0 && <button type="button" className="ibtn" onClick={() => setConversacion([])}>Nueva conversación</button>}
      </header>

      <div className="as-hilo" aria-live="polite">
        {conversacion.length === 0 && (
          <section className="card as-vacio">
            <h2>¿Qué quieres saber?</h2>
            <p className="s-mut">
              {modo === 'groq'
                ? 'Pregunta lo que quieras sobre el negocio: Groq consultará los datos y te dará su análisis.'
                : 'Puedes filtrar por ciudad, cliente, cobertura, métrica o marca, y escribir como te salga: entiende errores de tipeo.'}
            </p>
          </section>
        )}
        {conversacion.map((item) => <Mensaje key={item.id} item={item} />)}
        <div ref={fin} />
      </div>

      <div className="as-pie">
        <div className="as-sug" aria-label="Preguntas sugeridas">
          {sugerencias.map((s) => <button key={s} type="button" onClick={() => preguntar(s)}>{s}</button>)}
        </div>
        {llm?.disponible && (
          <div className="as-modo">
            <span className="fl" id="as-modo-l">Responde</span>
            <div className="pills" role="group" aria-labelledby="as-modo-l">
              {MODOS.map(([m, l, d]) => (
                <button key={m} type="button" aria-pressed={modo === m} title={d} onClick={() => setModo(m)}>{l}</button>
              ))}
            </div>
          </div>
        )}
        <form className="as-form" onSubmit={(e) => { e.preventDefault(); preguntar(texto); }}>
          <label htmlFor="as-q" className="vh">Tu pregunta</label>
          <input
            id="as-q" ref={entrada} value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" maxLength={300}
            placeholder={modo === 'groq' ? 'Ej: ¿qué opinas de nuestro panorama como empresa?' : 'Ej: ¿en qué tiendas de Ovalle está más débil Honor?'}
          />
          <button type="submit" className="abtn" disabled={!texto.trim()}>Preguntar</button>
        </form>
      </div>
    </div>
  );
}
