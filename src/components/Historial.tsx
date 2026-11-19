'use client';
import { useState } from 'react';
import { TODAS } from '@/lib/compute';
import type { ComparacionExcel } from '@/lib/excel';
import { fdate, num, pct } from '@/lib/format';
import { cambio, comparar, datosDeCorte, medir, type Corte, type Historial as Datos, type Medida, type Tendencia } from '@/lib/historial';
import { COBERTURAS, METRICAS, UNIDAD, metricaNombre, type Metrica } from '@/lib/types';
import { Flecha } from './Iconos';

const zona = process.env.NEXT_PUBLIC_ZONA || 'Norte';
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const corto = (f: string) => `${f.slice(8, 10)} ${MESES[Number(f.slice(5, 7)) - 1]}`;
const largo = (f: string) => `${corto(f)} ${f.slice(0, 4)}`;
const uniq = (a: string[]) => [...new Set(a)].sort((x, y) => x.localeCompare(y, 'es'));
const cobCorta = (c: string) => COBERTURAS.find((x) => x[0] === c)?.[1] ?? c;

/** Cambio en puntos de share: +3,2 pp / -1,0 pp / 0,0 pp. */
function pp(d: number | null) {
  if (d == null) return '-';
  const v = Math.round(d * 1000) / 10;
  return (v > 0 ? '+' : v < 0 ? '-' : '') + Math.abs(v).toFixed(1).replace('.', ',') + ' pp';
}
const clsCambio = (d: number | null) => {
  if (d == null) return 's-mut';
  const r = Math.round(d * 1000);
  return r > 0 ? 's-ok' : r < 0 ? 's-bad' : 's-mut';
};
const RESULTADO: Record<Tendencia, string> = { mejor: 'Mejoró', peor: 'Empeoró', igual: 'Sin cambio', sindato: 'Sin datos' };
const RIVALES = ['#60a5fa', '#a78bfa', '#94a3b8'];

export default function Historial({ tiendas, cortes }: Datos) {
  const n = cortes.length;
  const [met, setMet] = useState<Metrica>('exhibiciones');
  const [cob, setCob] = useState<string>(TODAS);
  const [cli, setCli] = useState<string>(TODAS);
  const [ciu, setCiu] = useState<string>(TODAS);
  const [ia, setIa] = useState(Math.max(0, n - 2));
  const [ib, setIb] = useState(Math.max(0, n - 1));
  const [vista, setVista] = useState<'todas' | Tendencia>('todas');

  if (!n) {
    return (
      <section className="card state">
        <h2>Aún no hay cortes guardados</h2>
        <p>Cada Excel que se publique desde Admin queda aquí como un corte con su fecha.</p>
      </section>
    );
  }

  // Filtros en cascada, igual que en el dashboard. Las tiendas cerradas quedan fuera de todos los cortes.
  const activas = tiendas.filter((t) => t.cobertura !== 'Cerrada');
  const enCob = activas.filter((t) => cob === TODAS || t.cobertura === cob);
  const clientes = uniq(enCob.filter((t) => ciu === TODAS || t.ciudad === ciu).map((t) => t.cliente));
  const cliOk = clientes.includes(cli) ? cli : TODAS;
  const ciudades = uniq(enCob.filter((t) => cliOk === TODAS || t.cliente === cliOk).map((t) => t.ciudad));
  const ciuOk = ciudades.includes(ciu) ? ciu : TODAS;
  const sel = enCob.filter((t) => (cliOk === TODAS || t.cliente === cliOk) && (ciuOk === TODAS || t.ciudad === ciuOk));
  const codigos = sel.map((t) => t.codigo);
  const partes = [cob === TODAS ? null : cobCorta(cob), cliOk === TODAS ? null : cliOk, ciuOk === TODAS ? null : ciuOk].filter(Boolean) as string[];
  const filtro = partes.length ? partes.join(' | ') : `toda la Zona ${zona}`;
  const nombreMet = metricaNombre(met);

  const M = cortes.map((c) => medir(c, codigos, met));
  const ult = M[n - 1];
  const ant = n > 1 ? M[n - 2] : null;
  const iPri = M.findIndex((x) => x.share != null);
  const dAnt = ant ? cambio(ant.share, ult.share) : null;
  const dIni = iPri >= 0 && iPri < n - 1 ? cambio(M[iPri].share, ult.share) : null;

  // Gráfico: Honor y sus tres rivales con más unidades en el corte más reciente con datos.
  const ref = [...M].reverse().find((x) => x.total > 0);
  const rivales = ref
    ? [...ref.porMarca.entries()].filter(([b, v]) => b !== 'Honor' && v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([b]) => b)
    : [];
  const series = [
    ...rivales.map((b, i) => ({ marca: b, color: RIVALES[i], vals: M.map((x) => (x.total ? (x.porMarca.get(b) ?? 0) / x.total : null)) })),
    { marca: 'Honor', color: 'var(--acc)', vals: M.map((x) => x.share), honor: true },
  ];

  // Share Honor por cliente (respeta cobertura y ciudad, no el filtro de cliente).
  const colsCli = cortes.slice(-8);
  const off = n - colsCli.length;
  const filasCli = uniq(enCob.filter((t) => ciuOk === TODAS || t.ciudad === ciuOk).map((t) => t.cliente))
    .map((cl) => {
      const cods = enCob.filter((t) => t.cliente === cl && (ciuOk === TODAS || t.ciudad === ciuOk)).map((t) => t.codigo);
      const s = cortes.map((c) => medir(c, cods, met).share);
      const p = s.findIndex((x) => x != null);
      const d = p >= 0 && p < n - 1 ? cambio(s[p], s[n - 1]) : null;
      return { cl, s: s.slice(off), d };
    })
    .filter((r) => r.s.some((x) => x != null))
    .sort((a, b) => (b.d ?? -9) - (a.d ?? -9));

  // Comparación de A a B
  const A = cortes[Math.min(ia, n - 1)];
  const B = cortes[Math.min(ib, n - 1)];
  const filas = n > 1 ? comparar(A, B, sel, met) : [];
  const cuenta = (t: Tendencia) => filas.filter((f) => f.t === t).length;
  const mA = medir(A, codigos, met);
  const mB = medir(B, codigos, met);
  const visibles = filas
    .filter((f) => vista === 'todas' || f.t === vista)
    .sort((x, y) => (vista === 'peor' ? (x.d ?? 9) - (y.d ?? 9) : (y.d ?? -9) - (x.d ?? -9)));

  // La libreria de Excel (unos 130 KB) se carga solo al descargar.
  const excel = () => import('@/lib/excel');

  async function bajarCorte(c: Corte) {
    const { descargarXlsx, exportarExcel } = await excel();
    descargarXlsx(exportarExcel(datosDeCorte(c, tiendas)), `Display_Honor_${zona}_corte_${c.fecha}.xlsx`);
  }

  async function bajarComparacion() {
    const marcas = uniq([...mA.porMarca.keys(), ...mB.porMarca.keys()])
      .sort((x, y) => (x === 'Honor' ? -1 : y === 'Honor' ? 1 : (mB.porMarca.get(y) ?? 0) - (mB.porMarca.get(x) ?? 0)));
    const sh = (m: Medida, b: string) => (m.total ? (m.porMarca.get(b) ?? 0) / m.total : null);
    const corta = (m: Medida | null) => (m ? { honor: m.honor, total: m.total, share: m.share, puesto: m.puesto } : null);
    const datos: ComparacionExcel = {
      metrica: nombreMet,
      filtro,
      fechaA: A.fecha,
      fechaB: B.fecha,
      marcas: marcas.map((b) => ({ marca: b, udsA: mA.porMarca.get(b) ?? 0, shareA: sh(mA, b), udsB: mB.porMarca.get(b) ?? 0, shareB: sh(mB, b) })),
      tiendas: [...filas].sort((x, y) => (y.d ?? -9) - (x.d ?? -9)).map((f) => ({ tienda: f.tienda, a: corta(f.a), b: corta(f.b), estado: RESULTADO[f.t] })),
      clientes: uniq(sel.map((t) => t.cliente)).map((cl) => {
        const cods = sel.filter((t) => t.cliente === cl).map((t) => t.codigo);
        return { cliente: cl, shareA: medir(A, cods, met).share, shareB: medir(B, cods, met).share };
      }),
    };
    const { descargarXlsx, exportarComparacion } = await excel();
    descargarXlsx(exportarComparacion(datos), `Comparacion_${met}_${A.fecha}_vs_${B.fecha}.xlsx`);
  }

  return (
    <>
      <header className="top">
        <div>
          <h1>Historial y evolución</h1>
          <p className="sub">Cada Excel publicado queda guardado como un corte con su fecha. Mira cómo se movió Honor en el tiempo y compara dos cortes tienda por tienda.</p>
        </div>
        <span className="hint">{n} {n === 1 ? 'corte guardado' : 'cortes guardados'} | desde {fdate(cortes[0].fecha)}</span>
      </header>

      <div className="filters">
        <div className="fg">
          <span className="fl">Métrica</span>
          <div className="pills">
            {METRICAS.map(([v, l]) => (
              <button key={v} type="button" aria-pressed={met === v} onClick={() => setMet(v)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="fg">
          <span className="fl">Cobertura</span>
          <div className="pills">
            {COBERTURAS.map(([v, l]) => (
              <button key={v} type="button" aria-pressed={cob === v} onClick={() => setCob(v)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="fg">
          <label className="fl" htmlFor="h-cli">Cliente</label>
          <select id="h-cli" value={cliOk} onChange={(e) => setCli(e.target.value)}>
            <option value={TODAS}>Todos</option>
            {clientes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="fg">
          <label className="fl" htmlFor="h-ciu">Ciudad</label>
          <select id="h-ciu" value={ciuOk} onChange={(e) => setCiu(e.target.value)}>
            <option value={TODAS}>Todas</option>
            {ciudades.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <section className="kpis">
        <div className="card kpi">
          <div className="kl">Share Honor | {corto(cortes[n - 1].fecha)}</div>
          <div className="kv s-acc">{pct(ult.share)}</div>
          <div className="ks">{nombreMet} | {num(ult.honor)} de {num(ult.total)} {UNIDAD[met]}</div>
        </div>
        <div className="card kpi">
          <div className="kl">vs corte anterior{ant ? ` | ${corto(cortes[n - 2].fecha)}` : ''}</div>
          <div className={'kv ' + clsCambio(dAnt)}>{pp(dAnt)}</div>
          <div className="ks">{ant ? <>{pct(ant.share)}<Flecha />{pct(ult.share)}</> : 'Aún hay un solo corte'}</div>
        </div>
        <div className="card kpi">
          <div className="kl">vs primer corte{iPri >= 0 && iPri < n - 1 ? ` | ${corto(cortes[iPri].fecha)}` : ''}</div>
          <div className={'kv ' + clsCambio(dIni)}>{pp(dIni)}</div>
          <div className="ks">{dIni != null ? <>{pct(M[iPri].share)}<Flecha />{pct(ult.share)}</> : 'Se calcula desde el segundo corte'}</div>
        </div>
        <div className="card kpi">
          <div className="kl">Puesto de Honor</div>
          <div className="kv">{ult.puesto ? `#${ult.puesto}` : '-'}</div>
          <div className="ks">
            {ult.puesto && ant?.puesto
              ? ult.puesto < ant.puesto ? <span className="s-ok">Subió desde #{ant.puesto}</span>
                : ult.puesto > ant.puesto ? <span className="s-bad">Bajó desde #{ant.puesto}</span>
                : `Igual que el corte anterior`
              : ult.puesto ? 'Primer corte' : `Sin ${UNIDAD[met]} registrados`}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="ch">
          <h2>Evolución del share</h2>
          <span className="hint">% de las unidades de todas las marcas en {filtro}, por fecha de corte</span>
        </div>
        <Grafico fechas={cortes.map((c) => c.fecha)} series={series} />
      </section>

      <section className="card">
        <div className="ch">
          <h2>Share Honor por cliente</h2>
          <span className="hint">{n > colsCli.length ? `Últimos ${colsCli.length} cortes | ` : ''}respeta cobertura y ciudad</span>
        </div>
        {filasCli.length ? (
          <div className="x">
            <table className="htab">
              <thead>
                <tr>
                  <th>Cliente</th>
                  {colsCli.map((c) => <th key={c.id}>{corto(c.fecha)}</th>)}
                  <th>Cambio</th>
                </tr>
              </thead>
              <tbody>
                {filasCli.map((r) => (
                  <tr key={r.cl}>
                    <td className="b">{r.cl}</td>
                    {r.s.map((v, i) => (
                      <td key={i} className={v == null ? 's-mut' : undefined}
                        style={v == null ? undefined : { background: `color-mix(in srgb, var(--acc) ${Math.round(Math.min(55, 6 + v * 90))}%, transparent)` }}>
                        {pct(v)}
                      </td>
                    ))}
                    <td className={'b ' + clsCambio(r.d)}>{pp(r.d)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">Sin registros de {nombreMet.toLowerCase()} para este filtro.</div>
        )}
      </section>

      <section className="card">
        <div className="hist-cmp-h">
          <div>
            <h2>Comparar dos cortes</h2>
            <span className="hint">Share Honor de {nombreMet.toLowerCase()} en cada tienda de {filtro}</span>
          </div>
          {n > 1 && (
            <div className="hist-sel">
              <label>Corte A (antes)
                <select value={ia} onChange={(e) => setIa(Number(e.target.value))}>
                  {cortes.map((c, k) => <option key={c.id} value={k}>{largo(c.fecha)}</option>)}
                </select>
              </label>
              <label>Corte B (después)
                <select value={ib} onChange={(e) => setIb(Number(e.target.value))}>
                  {cortes.map((c, k) => <option key={c.id} value={k}>{largo(c.fecha)}</option>)}
                </select>
              </label>
              <button className="abtn" type="button" onClick={bajarComparacion}>Descargar comparación</button>
            </div>
          )}
        </div>
        {n < 2 ? (
          <div className="empty">
            Para comparar se necesitan al menos dos cortes. Hoy está el del {fdate(cortes[0].fecha)}; el próximo Excel que publiques con otra fecha ya permite comparar.
          </div>
        ) : (
          <>
            <div className="hist-res">
              <div>
                <span className="l">Share total | {corto(A.fecha)}<Flecha />{corto(B.fecha)}</span>
                <b>{pct(mA.share)}<Flecha />{pct(mB.share)}</b>
                <span className={'b ' + clsCambio(cambio(mA.share, mB.share))}>{pp(cambio(mA.share, mB.share))}</span>
              </div>
              <div><span className="l">Mejoraron</span><b className="s-ok">{cuenta('mejor')}</b><span className="hint">tiendas</span></div>
              <div><span className="l">Empeoraron</span><b className="s-bad">{cuenta('peor')}</b><span className="hint">tiendas</span></div>
              <div><span className="l">Sin cambio</span><b>{cuenta('igual')}</b><span className="hint">tiendas</span></div>
              <div><span className="l">Sin datos en algún corte</span><b className="s-mut">{cuenta('sindato')}</b><span className="hint">tiendas</span></div>
            </div>
            {ia === ib && <p className="hint">Elegiste el mismo corte en A y B: no habrá cambios.</p>}
            {ia > ib && <p className="hint">El corte A es más reciente que el B: los cambios se leen al revés.</p>}
            <div className="pills hist-vistas">
              {(['todas', 'mejor', 'peor', 'igual', 'sindato'] as const).map((v) => (
                <button key={v} type="button" aria-pressed={vista === v} onClick={() => setVista(v)}>
                  {v === 'todas' ? 'Todas' : v === 'mejor' ? 'Mejoraron' : v === 'peor' ? 'Empeoraron' : v === 'igual' ? 'Sin cambio' : 'Sin datos'}
                </button>
              ))}
            </div>
            {visibles.length ? (
              <div className="x">
                <table className="htab">
                  <thead>
                    <tr>
                      <th>Tienda</th><th>Ciudad</th>
                      <th>Share {corto(A.fecha)}</th><th>Share {corto(B.fecha)}</th><th>Cambio</th>
                      <th>Honor A<Flecha />B</th><th>Puesto A<Flecha />B</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((f) => (
                      <tr key={f.tienda.codigo}>
                        <td className="t"><b>{f.tienda.tienda}</b><small>{f.tienda.cliente} | {cobCorta(f.tienda.cobertura)}</small></td>
                        <td className="s-mut">{f.tienda.ciudad}</td>
                        <td className="s-mut">{f.a ? pct(f.a.share) : 'sin dato'}</td>
                        <td>{f.b ? pct(f.b.share) : 'sin dato'}</td>
                        <td className={'b ' + clsCambio(f.d)}>{pp(f.d)}</td>
                        <td>{f.a ? f.a.honor : '-'}<Flecha />{f.b ? f.b.honor : '-'}</td>
                        <td>{f.a?.puesto ? `#${f.a.puesto}` : '-'}<Flecha />{f.b?.puesto ? `#${f.b.puesto}` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">No hay tiendas en esta vista.</div>
            )}
          </>
        )}
      </section>

      <section className="card">
        <div className="ch">
          <h2>Cortes guardados</h2>
          <span className="hint">El Excel trae todas las tiendas y métricas de esa fecha, en el formato de la plantilla</span>
        </div>
        <div className="x">
          <table className="htab">
            <thead>
              <tr>
                <th>Fecha de corte</th><th>Archivo</th>
                <th>Tiendas con dato</th><th>Share Honor</th><th>vs anterior</th><th aria-label="Descargar" />
              </tr>
            </thead>
            <tbody>
              {[...cortes].map((c, k) => ({ c, k })).reverse().map(({ c, k }) => {
                const d = k > 0 ? cambio(M[k - 1].share, M[k].share) : null;
                return (
                  <tr key={c.id}>
                    <td className="b">{largo(c.fecha)}{k === n - 1 && <span className="tag-act">ACTUAL</span>}</td>
                    <td className="t">
                      <b>{c.archivo ?? 'Excel'}</b>
                      <small>{c.por ?? 'Carga inicial'} | subido {new Date(c.created_at).toLocaleDateString('es-CL')}</small>
                    </td>
                    <td>{M[k].medidas} / {sel.length}</td>
                    <td className="b s-acc">{pct(M[k].share)}</td>
                    <td className={k ? clsCambio(d) : 's-mut'}>{k ? pp(d) : 'primer corte'}</td>
                    <td><button className="ibtn" type="button" onClick={() => bajarCorte(c)}>Descargar</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

interface Serie { marca: string; color: string; vals: (number | null)[]; honor?: boolean }

function Grafico({ fechas, series }: { fechas: string[]; series: Serie[] }) {
  const n = fechas.length;
  const max = Math.max(0, ...series.flatMap((s) => s.vals.filter((v): v is number => v != null)));
  if (!max) return <div className="empty">Sin registros de esta métrica en los cortes guardados.</div>;
  const tope = Math.min(1, Math.max(0.1, Math.ceil(max * 10 + 0.3) / 10));
  const x0 = 56, x1 = 776, yT = 26, yB = 240;
  const X = (k: number) => (n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * k) / (n - 1));
  const Y = (v: number) => yB - ((yB - yT) * v) / tope;
  const paso = Math.ceil(n / 10);
  const honor = series.find((s) => s.honor)!;
  const ultimo = (s: Serie) => [...s.vals].reverse().find((v) => v != null) ?? null;
  return (
    <>
      <div className="hist-leg">
        {[...series].reverse().map((s) => (
          <span key={s.marca}><i style={{ background: s.color }} />{s.marca}<span className="v">{pct(ultimo(s))}</span></span>
        ))}
      </div>
      <div className="x hist-graf">
        <svg className="hist-svg" viewBox="0 0 800 280" role="img" aria-label={`Share por corte: ${series.map((s) => `${s.marca} ${pct(ultimo(s))}`).join(', ')}`}>
          {[0, 1, 2, 3, 4].map((g) => {
            const v = (tope * g) / 4;
            return (
              <g key={g}>
                <line x1={x0 - 8} x2={x1 + 8} y1={Y(v)} y2={Y(v)} style={{ stroke: 'var(--line)' }} />
                <text x={x0 - 14} y={Y(v) + 4} textAnchor="end" fontSize="11" style={{ fill: 'var(--mut)' }}>{Math.round(v * 100)}%</text>
              </g>
            );
          })}
          {series.map((s) => {
            const pts = s.vals.map((v, k) => (v == null ? null : `${X(k)},${Y(v)}`)).filter(Boolean).join(' ');
            return <polyline key={s.marca} points={pts} fill="none" strokeWidth={s.honor ? 3.5 : 2} strokeLinejoin="round" style={{ stroke: s.color }} />;
          })}
          {series.filter((s) => !s.honor).map((s) => s.vals.map((v, k) => v == null ? null : (
            <circle key={s.marca + k} cx={X(k)} cy={Y(v)} r={3} style={{ fill: s.color }} />
          )))}
          {honor.vals.map((v, k) => v == null ? null : (
            <g key={k}>
              <circle cx={X(k)} cy={Y(v)} r={5} style={{ fill: 'var(--acc)' }} />
              {n <= 12 && <text x={X(k)} y={Y(v) - 12} textAnchor="middle" fontSize="11" fontWeight="800" style={{ fill: 'var(--acc)' }}>{pct(v)}</text>}
            </g>
          ))}
          {fechas.map((f, k) => (k % paso === 0 || k === n - 1) && (
            <text key={f} x={X(k)} y={268} textAnchor="middle" fontSize="12" fontWeight="700" style={{ fill: 'var(--mut)' }}>{corto(f)}</text>
          ))}
        </svg>
      </div>
    </>
  );
}
