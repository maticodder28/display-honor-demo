'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Modelo } from '@/lib/asistente/clasificador';
import { INTENCIONES, PREGUNTAS_EJEMPLO, type Intencion } from '@/lib/asistente/intenciones';
import modelo from '@/lib/asistente/modelo.json';
import { crearMotor, type Resultado } from '@/lib/asistente/motor';
import type { Respuesta } from '@/lib/asistente/herramientas';
import type { Historial } from '@/lib/historial';
import { metricaNombre } from '@/lib/types';

/** Texto con **negritas**. */
function Rico({ texto }: { texto: string }) {
  const partes = texto.split(/\*\*(.+?)\*\*/g);
  return <>{partes.map((p, i) => (i % 2 ? <b key={i}>{p}</b> : p))}</>;
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
  const nombre = (c: string) => INTENCIONES[c as Intencion]?.nombre ?? c;
  return (
    <details className="as-ent">
      <summary>Cómo lo entendí</summary>
      <div className="as-ent-c">
        <p>
          Intención: <b>{nombre(r.intencion)}</b>
          {r.origen !== 'propio' ? <> elegida por <b>{r.origen}</b></> : r.regla ? <> (regla: {r.regla})</> : <> con {Math.round(r.confianza * 100)}% de confianza</>}
        </p>
        {r.origen === 'propio' ? (
          <p className="s-mut">
            Resuelta por el modelo propio. Alternativas: {r.alternativas.map((a) => `${nombre(a.clase)} ${Math.round(a.p * 100)}%`).join(' | ')}
          </p>
        ) : (
          <p className="s-mut">El modelo propio no estaba seguro; el LLM solo eligió la herramienta y los filtros. Los números los calcula la app.</p>
        )}
        {chips.length ? (
          <ul className="as-chips">{chips.map(([k, v]) => <li key={k}><span>{k}</span>{v}</li>)}</ul>
        ) : <p className="s-mut">Sin filtros: toda la zona, métrica exhibiciones.</p>}
      </div>
    </details>
  );
}

interface Item { id: number; r: Resultado; consultando?: boolean; aviso?: string }

type Modo = 'auto' | 'propio' | 'groq';
const MODOS: [Modo, string, string][] = [
  ['auto', 'Automático', 'El modelo propio responde; Groq solo cuando no está seguro'],
  ['propio', 'Solo modelo propio', 'Nunca consulta a Groq'],
  ['groq', 'Groq', 'Todas las preguntas van a Groq'],
];

const AVISOS: Record<string, string> = {
  limite: 'El respaldo con Groq llegó a su límite de uso por ahora.',
  tiempo: 'Groq tardó demasiado en responder.',
  sin_clave: '',
};

function Mensaje({ item }: { item: Item }) {
  const consultando = item.r.regla === 'confianza baja' ? 'El modelo propio no está seguro: consultando a Groq...' : 'Consultando a Groq...';
  const { r } = item;
  const t = r.respuesta.tabla;
  if (item.consultando) {
    return (
      <article className="as-msg">
        <p className="as-yo">{r.pregunta}</p>
        <div className="card as-resp" aria-busy="true"><p className="as-txt s-mut">{consultando}</p></div>
      </article>
    );
  }
  return (
    <article className="as-msg">
      <p className="as-yo">{r.pregunta}</p>
      <div className="card as-resp">
        {item.aviso && <p className="as-txt s-mut">{item.aviso}</p>}
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
      </div>
    </article>
  );
}

export default function Asistente({ datos }: { datos: Historial }) {
  const responder = useMemo(() => crearMotor(modelo as Modelo, datos), [datos]);
  const [conversacion, setConversacion] = useState<Item[]>([]);
  const [llm, setLlm] = useState<{ disponible: boolean; modelo: string } | null>(null);
  const [modo, setModo] = useState<Modo>('auto');

  useEffect(() => {
    fetch('/api/asistente').then((r) => (r.ok ? r.json() : null)).then(setLlm).catch(() => setLlm(null));
  }, []);
  const [texto, setTexto] = useState('');
  const fin = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => { if (conversacion.length) fin.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [conversacion.length]);

  const preguntar = async (q: string) => {
    const p = q.trim();
    if (!p) return;
    const local = responder(p);
    // En modo automatico solo se consulta al LLM cuando el modelo propio no esta seguro: ahorra cuota y responde al instante.
    const usarLLM = !!llm?.disponible && (modo === 'groq' || (modo === 'auto' && local.regla === 'confianza baja'));
    const id = Date.now() + Math.random();
    setConversacion((c) => [...c, { id, r: local, consultando: !!usarLLM }].slice(-30));
    setTexto('');
    entrada.current?.focus();
    if (!usarLLM) return;
    let item: Item = { id, r: local };
    try {
      const res = await fetch('/api/asistente', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pregunta: p }) });
      const json = await res.json();
      item = json.resultado ? { id, r: json.resultado as Resultado } : { id, r: local, aviso: AVISOS[json.fallo] || 'El respaldo con Groq no está disponible en este momento.' };
    } catch {
      item = { id, r: local, aviso: 'El respaldo con Groq no está disponible en este momento.' };
    }
    setConversacion((c) => c.map((x) => (x.id === id ? item : x)));
  };

  const ultima = conversacion[conversacion.length - 1];
  const sugerencias = ultima && !ultima.consultando ? ultima.r.respuesta.sugerencias : PREGUNTAS_EJEMPLO;

  return (
    <div className="as">
      <header className="top">
        <div>
          <h1>Asistente</h1>
          <p className="sub">
            Pregúntale a los datos del Display en lenguaje natural. Funciona sin servicios externos: un clasificador
            propio y un extractor de entidades corren en tu navegador, y cada número sale de los mismos cálculos del dashboard.
          </p>
          <p className="sub">
            {llm?.disponible
              ? <>Respaldo con LLM activo ({llm.modelo} en Groq): solo cuando el modelo propio no entiende una pregunta, esa pregunta se envía a Groq para elegir la herramienta.</>
              : <>Respaldo con LLM desactivado: todo se resuelve con el modelo propio.</>}
          </p>
        </div>
        {conversacion.length > 0 && <button type="button" className="ibtn" onClick={() => setConversacion([])}>Nueva conversación</button>}
      </header>

      <div className="as-hilo" aria-live="polite">
        {conversacion.length === 0 && (
          <section className="card as-vacio">
            <h2>¿Qué quieres saber?</h2>
            <p className="s-mut">Puedes filtrar por ciudad, cliente, cobertura, métrica o marca, y escribir como te salga: entiende errores de tipeo.</p>
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
          <input id="as-q" ref={entrada} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej: ¿en qué tiendas de Ovalle está más débil Honor?" autoComplete="off" maxLength={200} />
          <button type="submit" className="abtn" disabled={!texto.trim()}>Preguntar</button>
        </form>
      </div>
    </div>
  );
}
