'use client';
import { useMemo, useState } from 'react';
import Donut from './Donut';
import {
  TODAS, clave, compute, estadoPuesto, lider, textoPuesto,
  type Agregado, type DetalleTienda, type Modelo,
} from '@/dominio/display/share';
import { num, pct, pct0 } from '@/dominio/comun/formato';
import {
  COBERTURAS, METRICAS, METRICAS_PRINCIPALES, SUB_MUEBLES, UNIDAD, esMueble, metricaNombre,
  type DatosCarga, type Metrica,
} from '@/dominio/display/modelo';

type Filtros = { cobertura: string; cliente: string; ciudad: string; metrica: Metrica };
type Tab = 'todas' | 'nolidera' | 'sindato';
type SortKey = keyof Pick<DetalleTienda,
  'codigo' | 'tienda' | 'cliente' | 'ciudad' | 'cobertura' | 'exh_honor' | 'exh_total' | 'exh_share' | 'mue_share' | 'mue_dc_share' | 'mue_dz_share' | 'pro_honor' | 'pro_total' | 'pro_share' | 'lider'>;
const TEXTO: SortKey[] = ['codigo', 'tienda', 'cliente', 'ciudad', 'cobertura', 'lider'];
const zona = process.env.NEXT_PUBLIC_ZONA || 'Norte';
const cobCorta = (c: string) => COBERTURAS.find((x) => x[0] === c)?.[1] ?? c;

export default function Dashboard({ raw, ejemplo }: { raw: DatosCarga; ejemplo?: boolean }) {
  const M = useMemo(() => compute(raw), [raw]);
  const [F, setF] = useState<Filtros>({ cobertura: TODAS, cliente: TODAS, ciudad: TODAS, metrica: 'exhibiciones' });
  const set = (p: Partial<Filtros>) => setF((f) => ({ ...f, ...p }));

  const enCob = M.tiendas.filter((t) => F.cobertura === TODAS || t.cobertura === F.cobertura);
  const clientesCob = [...new Set(enCob.map((t) => t.cliente))].sort();
  const cli = clientesCob.includes(F.cliente) ? F.cliente : TODAS;
  const ciudadesCli = [...new Set(enCob.filter((t) => cli === TODAS || t.cliente === cli).map((t) => t.ciudad))].sort();
  const ciu = ciudadesCli.includes(F.ciudad) ? F.ciudad : TODAS;
  const K = (o: { cob?: string; cli?: string; ciu?: string; m?: Metrica } = {}) =>
    clave(o.cob ?? F.cobertura, o.cli ?? cli, o.ciu ?? ciu, o.m ?? F.metrica);
  const clientes = [...new Set(enCob.filter((t) => ciu === TODAS || t.ciudad === ciu).map((t) => t.cliente))].sort();
  const partes = [F.cobertura === TODAS ? null : cobCorta(F.cobertura), cli === TODAS ? null : cli, ciu === TODAS ? null : ciu].filter(Boolean);
  const scope = partes.length ? partes.join(' | ') : `la Zona ${zona}`;
  const n = M.marcas.length;

  if (!M.tiendas.length) {
    return (
      <section className="card state">
        <h2>Aún no hay datos cargados</h2>
        <p>Cuando un administrador suba el Excel de levantamiento, aquí aparecerá el share de Honor por cliente, ciudad y tienda.</p>
      </section>
    );
  }

  const grupoActual = M.byG.get(K()) ?? [];
  const hAct = M.byKey.get(K() + '|Honor');
  const lAct = lider(M, K());
  const cAct = M.cobKey.get(K());

  return (
    <>
      <header className="top anchor" id="resumen">
        <div>
          <h1>Dashboard de Área Display | Zona {zona}</h1>
          <p className="sub">Exhibiciones, muebles y promotores de Honor frente a la competencia, por tienda.</p>
          <p className="take">
            {hAct && lAct && hAct.share != null ? (
              <>
                En {scope}, Honor tiene <b>{pct(hAct.share)}</b> del share de {metricaNombre(F.metrica).toLowerCase()} (puesto {hAct.puesto}
                {hAct.empate ? ', empatado' : ''})
                {lAct.marca !== 'Honor' && (<>; {hAct.puesto === 1 ? 'empata con' : 'lidera'} {lAct.marca} con <b>{pct(lAct.share)}</b></>)}
                . Medido en <b>{cAct?.con ?? 0}</b> de {cAct?.tiendas ?? 0} tiendas.
              </>
            ) : (
              <>Aún no hay {UNIDAD[F.metrica]} registrados para {scope}.</>
            )}
          </p>
        </div>
        {ejemplo && <span className="demo">Datos de ejemplo</span>}
      </header>

      <div className="filters">
        <div className="fg">
          <span className="fl">Cobertura</span>
          <div className="pills">
            {COBERTURAS.map(([v, l]) => (
              <button key={v} type="button" aria-pressed={F.cobertura === v} onClick={() => set({ cobertura: v })}>{l}</button>
            ))}
          </div>
        </div>
        <div className="fg">
          <label className="fl" htmlFor="f-cliente">Cliente</label>
          <select id="f-cliente" value={cli} onChange={(e) => set({ cliente: e.target.value })}>
            <option value={TODAS}>Todas</option>
            {clientesCob.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="fg">
          <label className="fl" htmlFor="f-ciudad">Ciudad</label>
          <select id="f-ciudad" value={ciu} onChange={(e) => set({ ciudad: e.target.value })}>
            <option value={TODAS}>Todas</option>
            {ciudadesCli.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="fg">
          <span className="fl">Métrica</span>
          <div className="pills">
            {METRICAS_PRINCIPALES.map(([v, l]) => (
              <button key={v} type="button" aria-pressed={v === 'muebles' ? esMueble(F.metrica) : F.metrica === v}
                onClick={() => set({ metrica: v === 'muebles' && esMueble(F.metrica) ? F.metrica : v })}>{l}</button>
            ))}
          </div>
        </div>
        {esMueble(F.metrica) && (
          <div className="fg">
            <span className="fl">Muebles</span>
            <div className="pills">
              {SUB_MUEBLES.map(([v, l]) => (
                <button key={v} type="button" aria-pressed={F.metrica === v} onClick={() => set({ metrica: v })}>{l}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <Kpis M={M} K={K} cli={cli} ciu={ciu} cobertura={F.cobertura} />
      <Coberturas M={M} K={K} cobertura={F.cobertura} onPick={(c) => set({ cobertura: F.cobertura === c ? TODAS : c })} />

      <section className="card anchor" id="clientes">
        <div className="ch">
          <h2>Share Honor por cliente</h2>
          <div className="legend">
            <span><i style={{ background: 'var(--ok)' }} />Honor lidera</span>
            <span><i style={{ background: 'var(--warn)' }} />Puesto 2-3</span>
            <span><i style={{ background: 'var(--bad)' }} />Puesto 4 o peor</span>
          </div>
        </div>
        <div className="sec first">Por métrica</div>
        <div className="x">
          <table className="heat">
            <thead><tr><th>Métrica</th>{clientes.map((c) => <th key={c}>{c}</th>)}<th>Total</th></tr></thead>
            <tbody>
              {METRICAS.map(([m, l]) => (
                <tr key={m} className={m === 'muebles_dc' || m === 'muebles_dz' ? 'sub' : undefined}>
                  <td>{m === 'muebles_dc' ? 'DC' : m === 'muebles_dz' ? 'Display Zone' : l}</td>
                  {clientes.map((c) => <HeatCell key={c} M={M} k={K({ cli: c, m }) + '|Honor'} n={n} />)}
                  <HeatCell M={M} k={K({ cli: TODAS, m }) + '|Honor'} n={n} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="sec">Por ciudad | {metricaNombre(F.metrica)}</div>
        <div className="x">
          <table className="heat">
            <thead><tr><th>Ciudad</th>{clientes.map((c) => <th key={c}>{c}</th>)}<th>Total</th></tr></thead>
            <tbody>
              {[...ciudadesCli, TODAS].map((u) => (
                <tr key={u} className={u === TODAS ? 'tot' : undefined}>
                  <td>{u === TODAS ? 'Total' : u}</td>
                  {clientes.map((c) => <HeatCell key={c} M={M} k={K({ cli: c, ciu: u }) + '|Honor'} n={n} />)}
                  <HeatCell M={M} k={K({ cli: TODAS, ciu: u }) + '|Honor'} n={n} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="two">
        <div className="card">
          <div className="ch"><h2>Mix por marca | {metricaNombre(F.metrica)}</h2><span className="hint">% del total contado</span></div>
          <Donut grupo={grupoActual} marcas={M.marcas} unidad={UNIDAD[F.metrica]} />
        </div>
        <div className="card">
          <div className="ch"><h2>Honor vs. líder por cliente</h2><span className="hint">share de {metricaNombre(F.metrica).toLowerCase()}</span></div>
          <VsLider M={M} K={K} clientes={clientes} metrica={F.metrica} />
        </div>
      </section>

      <section className="card">
        <div className="ch"><h2>{metricaNombre(F.metrica)} por marca y cliente</h2><span className="hint">unidades | tiendas con dato</span></div>
        <div className="x">
          <table className="heat">
            <thead><tr><th>Cliente</th>{M.marcas.map((m) => <th key={m}>{m}</th>)}<th>Total</th><th>Share Honor</th></tr></thead>
            <tbody>
              {[...clientes, TODAS].map((c) => {
                const g = K({ cli: c });
                const fila = M.marcas.map((m) => M.byKey.get(g + '|' + m));
                const any = fila.find(Boolean);
                return (
                  <tr key={c} className={c === TODAS ? 'tot' : undefined}>
                    <td>{c === TODAS ? 'Total' : c}</td>
                    {fila.map((r, i) =>
                      !r ? <td key={i} className="na">-</td> : (
                        <td key={i} style={
                          M.marcas[i] === 'Honor' ? { color: 'var(--acc-tx)' }
                            : r.puesto === 1 && r.valor > 0 ? { background: 'color-mix(in srgb, var(--fg) 9%, transparent)' }
                              : { fontWeight: 500 }
                        }>{num(r.valor)}</td>
                      ))}
                    <td>{any ? num(any.total) : '-'}</td>
                    <HeatCell M={M} k={g + '|Honor'} n={n} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <TablaTiendas M={M} cobertura={F.cobertura} cliente={cli} ciudad={ciu} />
    </>
  );
}

type KFn = (o?: { cob?: string; cli?: string; ciu?: string; m?: Metrica }) => string;

function Kpis({ M, K, cli, ciu, cobertura }: { M: Modelo; K: KFn; cli: string; ciu: string; cobertura: string }) {
  const c1 = M.cobKey.get(K({ m: 'exhibiciones' }));
  const c2 = M.cobKey.get(K({ m: 'muebles' }));
  const c3 = M.cobKey.get(K({ m: 'promotores' }));
  const p = c1 ? c1.con / c1.tiendas : null;
  return (
    <section className="kpis">
      <div className="card kpi scope">
        <div className="kl">Scope</div>
        <div className="kv">{ciu !== TODAS ? ciu : cli !== TODAS ? cli : `Zona ${zona}`}</div>
        <div className="ks">{[cobertura === TODAS ? 'Promotor + Middle' : cobCorta(cobertura), c1 ? `${c1.tiendas} tiendas` : null].filter(Boolean).join(' | ')}</div>
      </div>
      {METRICAS_PRINCIPALES.map(([m, l]) => {
        const r = M.byKey.get(K({ m }) + '|Honor');
        return (
          <div className="card kpi" key={m}>
            <div className="kl">Share {l.toLowerCase()}</div>
            <div className="kv s-acc">{r && r.share != null ? pct(r.share) : '-'}</div>
            <div className="ks">
              {r && r.total ? (
                <>{num(r.valor)} de {num(r.total)} {UNIDAD[m]}<span className={'badge b-' + estadoPuesto(r.puesto)}>{textoPuesto(r, M.marcas.length)}</span></>
              ) : r ? `Sin ${UNIDAD[m]} registrados` : 'Sin datos'}
            </div>
            {m === 'muebles' && <DetalleMuebles M={M} K={K} />}
          </div>
        );
      })}
      <div className="card kpi">
        <div className="kl">Tiendas medidas</div>
        <div className={'kv s-' + (p == null ? 'mut' : p >= 0.9 ? 'ok' : p >= 0.7 ? 'warn' : 'bad')}>{pct0(p)}</div>
        <div className="ks">{c1 && c2 && c3 ? `Exh ${c1.con}/${c1.tiendas} | Mueb ${c2.con}/${c2.tiendas} | Prom ${c3.con}/${c3.tiendas}` : ''}</div>
      </div>
    </section>
  );
}

function Coberturas({ M, K, cobertura, onPick }: { M: Modelo; K: KFn; cobertura: string; onPick: (c: string) => void }) {
  const tarjetas = [['Promotor', 'Cobertura Promotor', 'PR', ''], ['Middle Management', 'Middle Management', 'MM', 'mm']] as const;
  return (
    <section className="cobs">
      {tarjetas.map(([cv, titulo, ini, cls]) => {
        const c = M.cobKey.get(K({ cob: cv, m: 'exhibiciones' }));
        if (!c) return null;
        const estado = cobertura === cv ? ' on' : cobertura !== TODAS ? ' dim' : '';
        return (
          <button key={cv} type="button" className={`card cob ${cls}${estado}`} aria-pressed={cobertura === cv} title={`Filtrar por ${titulo}`} onClick={() => onPick(cv)}>
            <div className="cobh">
              <div className="av">{ini}</div>
              <div><b>{titulo}</b><span>{c.tiendas} tiendas | Honor vs. marca líder</span></div>
            </div>
            <div className="cobb">
              {METRICAS_PRINCIPALES.map(([m, label]) => {
                const g = K({ cob: cv, m });
                const r = M.byKey.get(g + '|Honor');
                const l = lider(M, g);
                const max = Math.max(0.35, l?.share ?? 0);
                return (
                  <div className="met" key={m}>
                    <div className="mt">
                      <span className="n">{label}{r && <span className="c">| {num(r.valor)}/{num(r.total)}</span>}</span>
                      {r && <span className={'badge b-' + estadoPuesto(r.puesto)}>{textoPuesto(r, M.marcas.length)}</span>}
                    </div>
                    <div className="track">
                      <div className="fill" style={{ width: r?.share != null ? `${(r.share / max) * 100}%` : 0 }} />
                      {l && l.marca !== 'Honor' && <div className="tick" style={{ left: `${((l.share ?? 0) / max) * 100}%` }} />}
                    </div>
                    <div className="mb">
                      <span>
                        {l ? (<>{r?.empate && r.puesto === 1 ? 'Empata con ' : 'Líder '}<b>{l.marca}</b> <b>{pct(l.share)}</b></>)
                          : r ? `Sin ${UNIDAD[m]} registrados` : 'Sin datos'}
                      </span>
                      <span className={'big s-' + (r?.share != null ? estadoPuesto(r.puesto) : 'bad')}>{pct(r?.share)}</span>
                    </div>
                    {m === 'muebles' && <DetalleMuebles M={M} K={(o) => K({ ...o, cob: cv })} />}
                  </div>
                );
              })}
            </div>
          </button>
        );
      })}
    </section>
  );
}

/** Línea "DC x% | Display Zone y%" bajo el share total de muebles. */
function DetalleMuebles({ M, K }: { M: Modelo; K: KFn }) {
  const partes = (['muebles_dc', 'muebles_dz'] as const).map((m) => {
    const r = M.byKey.get(K({ m }) + '|Honor');
    return (
      <span key={m}>
        {m === 'muebles_dc' ? 'DC' : 'Display Zone'}{' '}
        <b className={r?.share != null ? 's-' + estadoPuesto(r.puesto) : 's-mut'}>{r?.share != null ? pct(r.share) : '-'}</b>
        {r && r.total ? <span className="s-mut"> ({num(r.valor)}/{num(r.total)})</span> : null}
      </span>
    );
  });
  return <div className="ks dcdz">{partes[0]}<span className="s-mut">|</span>{partes[1]}</div>;
}

function HeatCell({ M, k, n }: { M: Modelo; k: string; n: number }) {
  const r = M.byKey.get(k);
  if (!r || r.share == null) return <td className="na" title={r ? 'Sin unidades registradas' : undefined}>-</td>;
  return (
    <td className={'h-' + estadoPuesto(r.puesto)} title={`Honor ${textoPuesto(r, n)} | ${num(r.valor)} de ${num(r.total)}`}>
      {pct0(r.share)}
    </td>
  );
}

function VsLider({ M, K, clientes, metrica }: { M: Modelo; K: KFn; clientes: string[]; metrica: Metrica }) {
  const todos = clientes
    .map((c) => ({ c, h: M.byKey.get(K({ cli: c }) + '|Honor'), l: lider(M, K({ cli: c })) }))
    .filter((x): x is { c: string; h: Agregado; l: Agregado | null } => !!x.h);
  if (!todos.length) return <div className="empty">Sin datos para este filtro.</div>;
  const items = todos.filter((x): x is { c: string; h: Agregado; l: Agregado } => !!x.l)
    .sort((a, b) => ((b.h.share ?? 0) - (b.l.share ?? 0)) - ((a.h.share ?? 0) - (a.l.share ?? 0)));
  const vacios = todos.filter((x) => !x.l);
  const max = Math.max(...items.map((x) => Math.max(x.l.share ?? 0, x.h.share ?? 0)), 0.01);
  const Bar = ({ cls, share, txt }: { cls: string; share: number | null; txt: string }) => (
    <div className="bar">
      <div className={'r ' + cls} style={{ width: `calc((100% - 110px) * ${(share ?? 0) / max})` }} />
      <span><b>{pct(share)}</b> {txt}</span>
    </div>
  );
  return (
    <div className="vs">
      {items.map(({ c, h, l }) => (
        <div className="vsr" key={c}>
          <b>{c}</b>
          <div className="bars">
            <Bar cls="h" share={h.share} txt="Honor" />
            {l.marca === 'Honor' ? (
              <div className="bar s-ok">Honor lidera</div>
            ) : (
              <>
                <Bar cls="l" share={l.share} txt={l.marca} />
                {h.valor === l.valor && <div className="bar s-warn">Empate en el 1.er lugar</div>}
              </>
            )}
          </div>
        </div>
      ))}
      {vacios.map(({ c }) => (
        <div className="vsr" key={c}>
          <b>{c}</b>
          <div className="bar s-mut">Sin {UNIDAD[metrica]} registrados de ninguna marca</div>
        </div>
      ))}
    </div>
  );
}

function TablaTiendas({ M, cobertura, cliente, ciudad }: { M: Modelo; cobertura: string; cliente: string; ciudad: string }) {
  const [tab, setTab] = useState<Tab>('todas');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'exh_share', dir: -1 });

  let rows = M.detalle.filter((r) =>
    (cobertura === TODAS || r.cobertura === cobertura) && (cliente === TODAS || r.cliente === cliente) && (ciudad === TODAS || r.ciudad === ciudad));
  if (tab === 'nolidera') rows = rows.filter((r) => r.lider && !r.lider.split(' / ').includes('Honor'));
  if (tab === 'sindato') rows = rows.filter((r) => r.exh_share == null || r.mue_share == null || r.pro_share == null);
  const qq = q.trim().toLowerCase();
  if (qq) rows = rows.filter((r) => [r.codigo, r.tienda, r.cliente, r.ciudad].join(' ').toLowerCase().includes(qq));
  rows = [...rows].sort((a, b) => {
    const x = a[sort.k], y = b[sort.k];
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return (typeof x === 'number' ? x - (y as number) : String(x).localeCompare(String(y))) * sort.dir;
  });

  const cols: [SortKey, string, boolean][] = [
    ['codigo', 'Código', true], ['tienda', 'Tienda', true], ['cliente', 'Cliente', true], ['ciudad', 'Ciudad', true],
    ['cobertura', 'Cobertura', true], ['exh_honor', 'Exh. Honor', false], ['exh_total', 'Exh. total', false],
    ['exh_share', 'Share exh.', false], ['mue_share', 'Share mueb.', false], ['mue_dc_share', 'Mueb. DC', false], ['mue_dz_share', 'Display Zone', false], ['pro_honor', 'Prom. Honor', false],
    ['pro_total', 'Prom. total', false], ['pro_share', 'Share prom.', false], ['lider', 'Líder exh.', true],
  ];
  const ordenar = (k: SortKey) =>
    setSort((s) => (s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: TEXTO.includes(k) ? 1 : -1 }));
  const shareCls = (v: number) => 'st s-' + (v >= 0.15 ? 'ok' : v >= 0.10 ? 'warn' : 'bad');

  return (
    <section className="card anchor" id="tiendas">
      <div className="ch">
        <h2>Detalle de tiendas</h2>
        <div className="tt">
          <div className="tabs">
            {([['todas', 'Todas'], ['nolidera', 'Honor no lidera'], ['sindato', 'Sin levantamiento']] as const).map(([v, l]) => (
              <button key={v} type="button" aria-pressed={tab === v} onClick={() => setTab(v)}>{l}</button>
            ))}
          </div>
          <input type="search" id="buscar-tienda" placeholder="Buscar tienda o código..." aria-label="Buscar tienda" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="count">{rows.length} tiendas</span>
        </div>
      </div>
      <div className="scroll">
        <table className="det">
          <thead>
            <tr>
              {cols.map(([k, l, izq]) => (
                <th key={k} className={izq ? 'l' : undefined} aria-sort={sort.k === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => ordenar(k)}>{l}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.codigo}>
                <td className="l code">{r.codigo}</td>
                <td className="l" style={{ fontWeight: 700 }}>{r.tienda}</td>
                <td className="l">{r.cliente}</td>
                <td className="l">{r.ciudad}</td>
                <td className="l">
                  <span className={'chip ' + (r.cobertura === 'Promotor' ? 'p' : r.cobertura === 'Middle Management' ? 'm' : 'n')}>{r.cobertura}</span>
                </td>
                {(['exh_honor', 'exh_total', 'exh_share', 'mue_share', 'mue_dc_share', 'mue_dz_share', 'pro_honor', 'pro_total', 'pro_share'] as const).map((k) => {
                  const v = r[k];
                  if (v == null) return <td key={k} className="na">-</td>;
                  return k.endsWith('share') ? <td key={k} className={shareCls(v)}>{pct(v)}</td> : <td key={k}>{num(v)}</td>;
                })}
                <td className={'l' + (r.lider == null ? ' na' : r.lider === 'Honor' ? ' s-ok st' : '')}>{r.lider ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
