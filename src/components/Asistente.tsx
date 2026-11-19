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
          {r.regla ? <> (regla: {r.regla})</> : <> con {Math.round(r.confianza * 100)}% de confianza</>}
        </p>
        <p className="s-mut">
          Alternativas: {r.alternativas.map((a) => `${nombre(a.clase)} ${Math.round(a.p * 100)}%`).join(' | ')}
        </p>
        {chips.length ? (
          <ul className="as-chips">{chips.map(([k, v]) => <li key={k}><span>{k}</span>{v}</li>)}</ul>
        ) : <p className="s-mut">Sin filtros: toda la zona, métrica exhibiciones.</p>}
      </div>
    </details>
  );
}

function Mensaje({ r }: { r: Resultado }) {
  const t = r.respuesta.tabla;
  return (
    <article className="as-msg">
      <p className="as-yo">{r.pregunta}</p>
      <div className="card as-resp">
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
  const [conversacion, setConversacion] = useState<Resultado[]>([]);
  const [texto, setTexto] = useState('');
  const fin = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLInputElement>(null);

  useEffect(() => { if (conversacion.length) fin.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [conversacion.length]);

  const preguntar = (q: string) => {
    const p = q.trim();
    if (!p) return;
    setConversacion((c) => [...c, responder(p)].slice(-30));
    setTexto('');
    entrada.current?.focus();
  };

  const ultima = conversacion[conversacion.length - 1];
  const sugerencias = ultima ? ultima.respuesta.sugerencias : PREGUNTAS_EJEMPLO;

  return (
    <div className="as">
      <header className="top">
        <div>
          <h1>Asistente</h1>
          <p className="sub">
            Pregúntale a los datos del Display en lenguaje natural. Funciona sin servicios externos: un clasificador
            propio y un extractor de entidades corren en tu navegador, y cada número sale de los mismos cálculos del dashboard.
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
        {conversacion.map((r, i) => <Mensaje key={i} r={r} />)}
        <div ref={fin} />
      </div>

      <div className="as-pie">
        <div className="as-sug" aria-label="Preguntas sugeridas">
          {sugerencias.map((s) => <button key={s} type="button" onClick={() => preguntar(s)}>{s}</button>)}
        </div>
        <form className="as-form" onSubmit={(e) => { e.preventDefault(); preguntar(texto); }}>
          <label htmlFor="as-q" className="vh">Tu pregunta</label>
          <input id="as-q" ref={entrada} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej: ¿en qué tiendas de Ovalle está más débil Honor?" autoComplete="off" maxLength={200} />
          <button type="submit" className="abtn" disabled={!texto.trim()}>Preguntar</button>
        </form>
      </div>
    </div>
  );
}
