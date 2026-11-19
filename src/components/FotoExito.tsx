'use client';
import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { BitPerfil } from '@/lib/data';
import {
  CLUSTERS, columnasSemana, cumplimiento, fechaCorta, nombreSemana, numeroPrioridad, sumar, sumarDias,
  type FotoPrioridad, type FotoProducto, type FotoRespuesta, type FotoSemana, type FotoTienda,
} from '@/lib/foto';
import { Check } from './Iconos';

interface Props {
  semanaActual: string;
  usuario: { id: string; nombre: string; esAdmin: boolean; puedeRegistrar: boolean; esPromotor: boolean; tiendaCodigo: string | null };
  productos: FotoProducto[];
  prioridades: FotoPrioridad[];
  semanasPrio: FotoSemana[];
  tiendas: FotoTienda[];
  respuestas: FotoRespuesta[];
  perfiles: BitPerfil[];
}

type Vista = 'equipo' | 'llenar' | 'productos';
const pct = (x: number | null) => (x == null ? '-' : `${Math.round(x * 100)}%`);
const clsCumpl = (x: number | null) => (x == null ? 's-mut' : x >= 0.7 ? 's-ok' : x >= 0.4 ? 's-warn' : 's-bad');
function pp(d: number) {
  const v = Math.round(d * 100);
  return `${v > 0 ? '+' : v < 0 ? '-' : ''}${Math.abs(v)} pp`;
}
const clsDelta = (d: number) => (Math.round(d * 100) > 0 ? 's-ok' : Math.round(d * 100) < 0 ? 's-bad' : 's-mut');
const cobCorta = (c: string) => (c === 'Middle Management' ? 'Middle Mgmt' : c);

export default function FotoExito(props: Props) {
  const { semanaActual, usuario, tiendas } = props;
  const supabase = useMemo(() => createClient(), []);
  const [productos, setProductos] = useState(props.productos);
  const [prioridades, setPrioridades] = useState(props.prioridades);
  // Semana actual: la tabla vigente (refleja cambios al instante). Semanas pasadas: su copia congelada.
  const copias = useMemo(() => new Map(props.semanasPrio.map((s) => [s.semana, s.prioridades])), [props.semanasPrio]);
  const prioDe = (sem: string) => (sem >= semanaActual ? prioridades : copias.get(sem) ?? prioridades);
  const [respuestas, setRespuestas] = useState(props.respuestas);
  const verEquipo = !usuario.esPromotor;
  const puedeLlenar = usuario.puedeRegistrar || (usuario.esPromotor && !!usuario.tiendaCodigo);
  const [vista, setVista] = useState<Vista>(verEquipo ? 'equipo' : 'llenar');
  const nombre = useMemo(() => new Map(props.perfiles.map((p) => [p.id, p.nombre || 'Usuario'])), [props.perfiles]);

  // Semanas: la actual y las que tienen respuestas, de la más nueva a la más antigua.
  const semanas = useMemo(
    () => [...new Set([semanaActual, ...respuestas.map((r) => r.semana)])].filter((s) => s <= semanaActual).sort().reverse(),
    [respuestas, semanaActual],
  );
  const [semana, setSemana] = useState(semanaActual);

  if (!tiendas.length) {
    return (
      <section className="card state">
        <h2>No hay tiendas para la Foto del Éxito</h2>
        <p>{usuario.esPromotor ? 'Tu usuario aún no tiene una tienda asignada. Pídeselo al administrador.' : 'No se encontraron tiendas Entel activas en la zona.'}</p>
      </section>
    );
  }

  const vistas: [Vista, string][] = [
    ...(verEquipo ? [['equipo', 'Vista del equipo'] as [Vista, string]] : []),
    ...(puedeLlenar ? [['llenar', usuario.esPromotor ? 'Llenar mi tienda' : 'Llenar Foto del Éxito'] as [Vista, string]] : []),
    ...(usuario.esAdmin ? [['productos', 'Productos del mes'] as [Vista, string]] : []),
  ];

  return (
    <>
      <header className="top">
        <div>
          <h1>Foto del Éxito | Entel</h1>
          <p className="sub">
            {usuario.esPromotor
              ? 'Marca cada semana qué productos Honor están exhibidos en tu tienda y cuántos equipos hay en mesas genéricas.'
              : 'Checklist semanal de exhibición (lunes a domingo). Cada promotor llena su tienda; el equipo de zona puede llenar o corregir cualquier tienda cuando la visita.'}
          </p>
        </div>
        <span className="hint">Semana actual: {nombreSemana(semanaActual)}</span>
      </header>

      {vistas.length > 1 && (
        <div className="foto-tabs" role="tablist" aria-label="Vistas">
          {vistas.map(([v, l]) => (
            <button key={v} type="button" role="tab" aria-selected={vista === v} className={vista === v ? 'on' : undefined} onClick={() => setVista(v)}>{l}</button>
          ))}
        </div>
      )}

      {vista === 'equipo' && verEquipo && (
        <VistaEquipo
          semana={semana} setSemana={setSemana} semanas={semanas} semanaActual={semanaActual}
          productos={productos} prioridades={prioDe(semana)} tiendas={tiendas} respuestas={respuestas} nombre={nombre}
        />
      )}
      {vista === 'llenar' && puedeLlenar && (
        <Formulario
          key={usuario.tiendaCodigo ?? 'equipo'}
          usuario={usuario} semanaActual={semanaActual} semanas={semanas} productos={productos} prioDe={prioDe} tiendas={tiendas}
          respuestas={respuestas} nombre={nombre}
          onGuardada={(r) => {
            setRespuestas((l) => [r, ...l.filter((x) => !(x.semana === r.semana && x.tienda_codigo === r.tienda_codigo))]);
            setSemana(r.semana);
          }}
          guardar={async (tienda, exhibidos, mesas, comentario, sem) => {
            const { error } = await supabase.rpc('guardar_foto', { p_tienda: tienda, p_exhibidos: exhibidos, p_mesas: mesas, p_comentario: comentario, p_semana: sem });
            return error ? error.message : null;
          }}
        />
      )}
      {vista === 'productos' && usuario.esAdmin && (
        <>
          <Productos productos={productos} onCambio={setProductos} supabase={supabase} />
          <Prioridades productos={productos} prioridades={prioridades} onCambio={setPrioridades} supabase={supabase} />
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------
// Vista del equipo: indicadores, matriz y descarga
// ---------------------------------------------------------------------
function VistaEquipo({ semana, setSemana, semanas, semanaActual, productos, prioridades, tiendas, respuestas, nombre }: {
  semana: string; setSemana: (s: string) => void; semanas: string[]; semanaActual: string;
  productos: FotoProducto[]; prioridades: FotoPrioridad[]; tiendas: FotoTienda[]; respuestas: FotoRespuesta[]; nombre: Map<string, string>;
}) {
  const [bajando, setBajando] = useState(false);
  const deSemana = respuestas.filter((r) => r.semana === semana);
  const porTienda = new Map(deSemana.map((r) => [r.tienda_codigo, r]));
  const semAnt = sumarDias(semana, -7);
  const anterior = new Map(respuestas.filter((r) => r.semana === semAnt).map((r) => [r.tienda_codigo, r]));
  const cols = columnasSemana(productos, deSemana);

  const resp = tiendas.filter((t) => porTienda.has(t.codigo));
  const faltan = tiendas.filter((t) => !porTienda.has(t.codigo));
  const cs = resp.map((t) => cumplimiento(porTienda.get(t.codigo))!).filter((x) => x != null);
  const prom = cs.length ? sumar(cs) / cs.length : null;
  const csAnt = tiendas.map((t) => cumplimiento(anterior.get(t.codigo))).filter((x): x is number => x != null);
  const promAnt = csAnt.length ? sumar(csAnt) / csAnt.length : null;
  // Presencia de cada producto en las tiendas que lo tienen exigido (las que no, no cuentan).
  const presencia = cols.map((p) => {
    const exigen = resp.filter((t) => porTienda.get(t.codigo)!.requeridos.includes(p.id));
    return { p, x: exigen.length ? exigen.filter((t) => porTienda.get(t.codigo)!.exhibidos.includes(p.id)).length / exigen.length : null };
  });
  const peor = presencia.filter((x) => x.x != null).sort((a, b) => a.x! - b.x!)[0];
  const mesasN = resp.reduce((n, t) => n + porTienda.get(t.codigo)!.mesas.length, 0);
  const mesasEq = resp.reduce((n, t) => n + sumar(porTienda.get(t.codigo)!.mesas), 0);

  async function descargar() {
    setBajando(true);
    try {
      const [{ excelFotoSemana }, { descargarXlsx }] = await Promise.all([import('@/lib/fotoExcel'), import('@/lib/excel')]);
      const buf = await excelFotoSemana(semana, cols, tiendas, deSemana, prioridades);
      descargarXlsx(buf, `Foto_del_Exito_ENTEL_${semana}.xlsx`);
    } catch {
      window.alert('No se pudo generar el Excel. Intenta de nuevo.');
    } finally {
      setBajando(false);
    }
  }

  return (
    <>
      <div className="filters">
        <div className="fg">
          <span className="fl">Semana</span>
          <div className="pills">
            {semanas.slice(0, 8).map((s) => (
              <button key={s} type="button" aria-pressed={semana === s} onClick={() => setSemana(s)}>
                {nombreSemana(s)}{s === semanaActual ? ' (actual)' : ''}
              </button>
            ))}
          </div>
        </div>
        <button className="abtn" type="button" onClick={descargar} disabled={bajando} style={{ marginLeft: 'auto' }}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 2v8m0 0L5 7m3 3 3-3M3 13h10" /></svg>
          {bajando ? 'Generando...' : 'Descargar Excel de la semana'}
        </button>
      </div>

      <section className="kpis">
        <div className="card kpi">
          <div className="kl">Tiendas que respondieron</div>
          <div className="kv">{resp.length} de {tiendas.length}</div>
          <div className={'ks ' + (faltan.length ? 's-warn' : 's-ok')}>
            {faltan.length ? `Faltan: ${faltan.map((t) => t.tienda.replace(/^ENTEL\s+(QUINTEL|AUSTRAL)\s+/i, '')).join(', ')}` : 'Todas respondieron'}
          </div>
        </div>
        <div className="card kpi">
          <div className="kl">Cumplimiento promedio</div>
          <div className="kv s-acc">{pct(prom)}</div>
          <div className={'ks ' + (prom != null && promAnt != null ? clsDelta(prom - promAnt) : 's-mut')}>
            {prom != null && promAnt != null ? `${pp(prom - promAnt)} vs semana anterior` : 'Sin semana anterior para comparar'}
          </div>
        </div>
        <div className="card kpi">
          <div className="kl">Exigido con menos presencia</div>
          <div className="kv" style={{ fontSize: 22 }}>{peor ? peor.p.nombre : '-'}</div>
          <div className="ks">{peor ? `Exhibido en ${pct(peor.x)} de las tiendas que lo tienen exigido` : 'Sin respuestas esta semana'}</div>
        </div>
        <div className="card kpi">
          <div className="kl">Equipos en mesas genéricas</div>
          <div className="kv">{mesasEq}</div>
          <div className="ks">{mesasN} {mesasN === 1 ? 'mesa' : 'mesas'} en {resp.length} {resp.length === 1 ? 'tienda' : 'tiendas'}</div>
        </div>
      </section>

      <section className="card">
        <div className="ch">
          <h2>Exhibición por tienda | {nombreSemana(semana)}</h2>
          <span className="hint"><Check /> exhibido | <span className="foto-falta">X</span> exigido y no exhibido | <span className="foto-punto" /> no exigido para su cluster | cumplimiento = exigidos exhibidos / exigidos</span>
        </div>
        <div className="x">
          <table className="htab foto-mat">
            <thead>
              <tr>
                <th>Tienda</th>
                {cols.map((p) => <th key={p.id} title={p.nombre}>{p.corto}</th>)}
                <th>Cumplim.</th><th>Mesas genéricas</th><th>Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {tiendas.map((t) => {
                const r = porTienda.get(t.codigo);
                const c = cumplimiento(r), ca = cumplimiento(anterior.get(t.codigo));
                const ex = new Set(r?.exhibidos ?? []), ped = new Set(r?.pedidos ?? []), req = new Set(r?.requeridos ?? []);
                return (
                  <tr key={t.codigo} className={r ? undefined : 'pend'}>
                    <td className="t">
                      <b>{t.tienda}</b>
                      <small>{t.ciudad} | Cluster {t.cluster ?? '-'} | {cobCorta(t.cobertura)} | {t.cobertura === 'Promotor' ? 'promotor + equipo de zona' : 'equipo de zona'}</small>
                      {r?.comentario && <small className="foto-com">{r.comentario}</small>}
                    </td>
                    {cols.map((p) => {
                      const si = !!r && ex.has(p.id), exigido = req.has(p.id);
                      const n = numeroPrioridad(prioridades, p.id, t.cluster);
                      const titulo = `${p.nombre}: ${!r ? 'sin respuesta' : si ? 'exhibido' : 'no exhibido'}${exigido ? ` | exigido (Nro. ${n ?? '-'})` : ' | no exigido para su cluster'}`;
                      return (
                        <td key={p.id} title={titulo}
                          className={!r ? '' : !ped.has(p.id) ? 's-mut' : si ? (exigido ? 'foto-si' : 'foto-extra') : exigido ? 'foto-falta' : 'foto-na'}>
                          {!r ? '' : !ped.has(p.id) ? '' : si ? <Check titulo="exhibido" /> : exigido ? 'X' : <span className="foto-punto" />}
                        </td>
                      );
                    })}
                    <td>
                      <span className={'b ' + clsCumpl(c)}>{pct(c)}</span>
                      {c != null && ca != null && <small className={'foto-d ' + clsDelta(c - ca)}>{pp(c - ca)}</small>}
                    </td>
                    <td className="s-mut">{!r ? '-' : r.mesas.length ? `${r.mesas.length} | ${sumar(r.mesas)} eq.` : 'Sin mesas'}</td>
                    <td>
                      {r ? <><span>{fechaCorta(r.updated_at)}</span><small className="foto-d s-mut">{nombre.get(r.actualizado_por ?? '') ?? ''}</small></> : <span className="s-bad b">Pendiente</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {resp.length > 0 && (
              <tfoot>
                <tr>
                  <td className="b">% de tiendas</td>
                  {presencia.map(({ p, x }) => <td key={p.id} className={'b ' + clsCumpl(x)}>{pct(x)}</td>)}
                  <td /><td /><td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------------
// Formulario (promotor o equipo de zona)
// ---------------------------------------------------------------------
function Formulario({ usuario, semanaActual, semanas, productos, prioDe, tiendas, respuestas, nombre, onGuardada, guardar }: {
  usuario: Props['usuario']; semanaActual: string; semanas: string[]; productos: FotoProducto[]; prioDe: (s: string) => FotoPrioridad[]; tiendas: FotoTienda[];
  respuestas: FotoRespuesta[]; nombre: Map<string, string>;
  onGuardada: (r: FotoRespuesta) => void;
  guardar: (tienda: string, exhibidos: number[], mesas: number[], comentario: string, semana: string) => Promise<string | null>;
}) {
  const misTiendas = usuario.esPromotor ? tiendas.filter((t) => t.codigo === usuario.tiendaCodigo) : tiendas;
  // El equipo de zona puede corregir hasta 4 semanas atrás; el promotor solo la actual.
  const semanasOpc = usuario.esPromotor ? [semanaActual] : [0, 1, 2, 3].map((i) => sumarDias(semanaActual, -7 * i));
  const [tienda, setTienda] = useState(misTiendas[0]?.codigo ?? '');
  const [semana, setSemana] = useState(semanaActual);
  const base = cargar(tienda, semana);
  const [form, setForm] = useState(base);
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  void semanas;

  function cargar(cod: string, sem: string) {
    const actual = respuestas.find((r) => r.semana === sem && r.tienda_codigo === cod);
    if (actual) return { origen: 'enviada' as const, r: actual, pedidos: actual.pedidos, exhibidos: actual.exhibidos, mesas: actual.mesas, comentario: actual.comentario };
    const previa = respuestas.filter((r) => r.tienda_codigo === cod && r.semana < sem).sort((a, b) => (a.semana < b.semana ? 1 : -1))[0];
    const activos = productos.filter((p) => p.activo).map((p) => p.id);
    if (previa) return { origen: 'previa' as const, r: previa, pedidos: activos, exhibidos: previa.exhibidos.filter((id) => activos.includes(id)), mesas: previa.mesas, comentario: '' };
    return { origen: 'nueva' as const, r: null, pedidos: activos, exhibidos: [] as number[], mesas: [] as number[], comentario: '' };
  }
  const elegir = (cod: string, sem: string) => { setTienda(cod); setSemana(sem); setForm(cargar(cod, sem)); setEstado(null); };

  const lista = productos.filter((p) => form.pedidos.includes(p.id)).sort((a, b) => a.orden - b.orden);
  const toggle = (id: number) => setForm((f) => ({ ...f, exhibidos: f.exhibidos.includes(id) ? f.exhibidos.filter((x) => x !== id) : [...f.exhibidos, id] }));
  const setMesa = (i: number, v: string) => setForm((f) => { const m = f.mesas.slice(); m[i] = Math.min(200, Math.max(0, parseInt(v, 10) || 0)); return { ...f, mesas: m }; });
  const t = tiendas.find((x) => x.codigo === tienda);
  const prioridades = prioDe(semana);

  async function enviar() {
    setGuardando(true);
    const err = await guardar(tienda, form.exhibidos, form.mesas, form.comentario.trim(), semana);
    setGuardando(false);
    if (err) { setEstado({ ok: false, texto: `No se pudo enviar: ${err}` }); return; }
    const r: FotoRespuesta = {
      id: form.r && form.origen === 'enviada' ? form.r.id : -Date.now(), semana, tienda_codigo: tienda, pedidos: form.pedidos,
      requeridos: form.origen === 'enviada' && form.r ? form.r.requeridos
        : form.pedidos.filter((id) => numeroPrioridad(prioridades, id, t?.cluster ?? null) != null),
      exhibidos: form.exhibidos.filter((id) => form.pedidos.includes(id)), mesas: form.mesas, comentario: form.comentario.trim(),
      actualizado_por: usuario.id, updated_at: new Date().toISOString(),
    };
    onGuardada(r);
    setForm({ origen: 'enviada', r, pedidos: r.pedidos, exhibidos: r.exhibidos, mesas: r.mesas, comentario: r.comentario });
    setEstado({ ok: true, texto: `Enviada. ${t?.tienda ?? 'La tienda'} quedó registrada para la semana ${nombreSemana(semana)}.` });
  }

  const aviso = form.origen === 'enviada'
    ? `Ya se envió esta semana (${fechaCorta(form.r!.updated_at)}${form.r!.actualizado_por ? ' | ' + (nombre.get(form.r!.actualizado_por) ?? '') : ''}). Puedes corregirla.`
    : form.origen === 'previa'
      ? `Precargada con la semana ${nombreSemana(form.r!.semana)}: revisa y cambia solo lo que se movió.`
      : 'Primera vez para esta tienda: marca lo que está exhibido hoy.';

  return (
    <div className="foto-llenar">
      <section className="card foto-form bit-form">
        {usuario.esPromotor ? (
          <div><span className="kl">Tu tienda | Cluster {t?.cluster ?? '-'}</span><h2 style={{ marginTop: 4 }}>{t?.tienda ?? 'Sin tienda asignada'}</h2></div>
        ) : (
          <div className="bit-grid">
            <label className="bit-lbl">Tienda
              <select value={tienda} onChange={(e) => elegir(e.target.value, semana)}>
                {misTiendas.map((x) => <option key={x.codigo} value={x.codigo}>{x.tienda}{x.cobertura === 'Promotor' ? '' : ' | Middle Mgmt'}</option>)}
              </select>
            </label>
            <label className="bit-lbl">Semana
              <select value={semana} onChange={(e) => elegir(tienda, e.target.value)}>
                {semanasOpc.map((s) => <option key={s} value={s}>{nombreSemana(s)}{s === semanaActual ? ' (actual)' : ''}</option>)}
              </select>
            </label>
          </div>
        )}
        {usuario.esPromotor && <span className="hint">Semana {nombreSemana(semanaActual)}</span>}
        <div className="msg w">{aviso}</div>
        {!usuario.esPromotor && t && <span className="hint">Cluster {t.cluster ?? '-'}: los marcados con Nro. son los exigidos para esta tienda.</span>}

        {(['Equipo', 'Accesorio'] as const).map((tipo) => {
          const grupo = lista.filter((p) => p.tipo === tipo);
          if (!grupo.length) return null;
          return (
            <div key={tipo} className="foto-grupo">
              <span className="foto-gt">{tipo === 'Equipo' ? 'Equipos exhibidos' : 'Accesorios exhibidos'}</span>
              {grupo.map((p) => {
                const on = form.exhibidos.includes(p.id);
                const n = numeroPrioridad(prioridades, p.id, t?.cluster ?? null);
                return (
                  <button key={p.id} type="button" className={'foto-tg' + (on ? ' on' : '')} aria-pressed={on} onClick={() => toggle(p.id)}>
                    <span>{p.nombre}{n != null ? <small className="foto-n">Nro. {n} | exigido</small> : <small className="foto-n opc">opcional</small>}</span>
                    <span className="s">{on ? 'Exhibido' : 'No'}</span>
                  </button>
                );
              })}
            </div>
          );
        })}

        <div className="foto-mesas">
          <div className="foto-mh">
            <span className="foto-gt">Mesas genéricas (no de marca)</span>
            <div className="foto-step">
              <button type="button" className="ibtn" aria-label="Quitar una mesa" onClick={() => setForm((f) => ({ ...f, mesas: f.mesas.slice(0, -1) }))} disabled={!form.mesas.length}>-</button>
              <b>{form.mesas.length}</b>
              <button type="button" className="ibtn" aria-label="Agregar una mesa" onClick={() => setForm((f) => ({ ...f, mesas: [...f.mesas, 0] }))} disabled={form.mesas.length >= 8}>+</button>
            </div>
          </div>
          {form.mesas.length > 0 && (
            <div className="bit-grid">
              {form.mesas.map((v, i) => (
                <label key={i} className="bit-lbl">Equipos en mesa {i + 1}
                  <input type="number" min={0} max={200} inputMode="numeric" value={String(v)} onChange={(e) => setMesa(i, e.target.value)} />
                </label>
              ))}
            </div>
          )}
          <span className="hint">{form.mesas.length ? `Total en mesas genéricas: ${sumar(form.mesas)} equipos` : 'Sin mesas genéricas en esta tienda'}</span>
        </div>

        <label className="bit-lbl">Comentario (opcional)
          <textarea maxLength={500} value={form.comentario} onChange={(e) => setForm((f) => ({ ...f, comentario: e.target.value }))}
            placeholder="Ej. Solo dummies, falta código, robo de Watch 6..." />
        </label>
        {estado && <div className={'msg ' + (estado.ok ? 'o' : 'e')}>{estado.texto}</div>}
        <button className="abtn foto-enviar" type="button" onClick={enviar} disabled={guardando || !tienda}>
          {guardando ? 'Enviando...' : form.origen === 'enviada' ? 'Guardar corrección' : 'Enviar Foto del Éxito'}
        </button>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------
// Productos del mes (admin)
// ---------------------------------------------------------------------
function Productos({ productos, onCambio, supabase }: {
  productos: FotoProducto[]; onCambio: (p: FotoProducto[]) => void; supabase: ReturnType<typeof createClient>;
}) {
  const [nuevo, setNuevo] = useState({ nombre: '', corto: '', tipo: 'Equipo' as 'Equipo' | 'Accesorio' });
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null);
  const activos = productos.filter((p) => p.activo).length;

  async function alternar(p: FotoProducto) {
    const { error } = await supabase.from('foto_productos').update({ activo: !p.activo }).eq('id', p.id);
    if (error) { setEstado({ ok: false, texto: `No se pudo actualizar: ${error.message}` }); return; }
    onCambio(productos.map((x) => (x.id === p.id ? { ...x, activo: !x.activo } : x)));
    setEstado({ ok: true, texto: p.activo ? `${p.nombre} deja de pedirse desde la próxima respuesta.` : `${p.nombre} vuelve a pedirse.` });
  }

  const [editando, setEditando] = useState<{ id: number; nombre: string; corto: string; tipo: 'Equipo' | 'Accesorio' } | null>(null);

  async function guardarEdicion() {
    if (!editando) return;
    const nombre = editando.nombre.trim();
    const corto = (editando.corto.trim() || nombre.replace(/^honor\s+/i, '')).slice(0, 20);
    if (nombre.length < 2) { setEstado({ ok: false, texto: 'Escribe el nombre del producto.' }); return; }
    const { error } = await supabase.from('foto_productos').update({ nombre, corto, tipo: editando.tipo }).eq('id', editando.id);
    if (error) {
      setEstado({ ok: false, texto: error.code === '23505' ? 'Ya existe otro producto con ese nombre.' : `No se pudo guardar: ${error.message}` });
      return;
    }
    onCambio(productos.map((x) => (x.id === editando.id ? { ...x, nombre, corto, tipo: editando.tipo } : x)));
    setEditando(null);
    setEstado({ ok: true, texto: `${nombre} se actualizó.` });
  }

  async function eliminar(p: FotoProducto) {
    if (!window.confirm(`¿Eliminar ${p.nombre}? Esto no se puede deshacer.`)) return;
    const { error } = await supabase.from('foto_productos').delete().eq('id', p.id);
    if (error) {
      setEstado({ ok: false, texto: /ocúltalo/.test(error.message) ? `${p.nombre} ya está en respuestas enviadas: no se puede eliminar, ocúltalo con el botón "Se pide".` : `No se pudo eliminar: ${error.message}` });
      return;
    }
    onCambio(productos.filter((x) => x.id !== p.id));
    setEditando(null);
    setEstado({ ok: true, texto: `${p.nombre} se eliminó.` });
  }

  async function agregar() {
    const nombre = nuevo.nombre.trim();
    const corto = (nuevo.corto.trim() || nombre.replace(/^honor\s+/i, '')).slice(0, 20);
    if (nombre.length < 2) { setEstado({ ok: false, texto: 'Escribe el nombre del producto.' }); return; }
    const orden = Math.max(0, ...productos.map((p) => p.orden)) + 10;
    const { data, error } = await supabase.from('foto_productos').insert({ nombre, corto, tipo: nuevo.tipo, orden })
      .select('id, nombre, corto, tipo, orden, activo').single();
    if (error || !data) {
      setEstado({ ok: false, texto: error?.code === '23505' ? 'Ese producto ya existe: actívalo en la lista.' : `No se pudo agregar: ${error?.message}` });
      return;
    }
    onCambio([...productos, data as FotoProducto]);
    setNuevo({ nombre: '', corto: '', tipo: nuevo.tipo });
    setEstado({ ok: true, texto: `${nombre} se agregó y se pedirá desde la próxima respuesta.` });
  }

  return (
    <div className="bit-two">
      <section className="card">
        <div className="ch"><h2>Productos que se piden</h2><span className="hint">{activos} de {productos.length} activos</span></div>
        <div className="x">
          <table className="htab">
            <thead><tr><th>Producto</th><th>Abreviado</th><th>Tipo</th><th>En la Foto</th><th></th></tr></thead>
            <tbody>
              {productos.map((p) => editando?.id === p.id ? (
                <tr key={p.id}>
                  <td><input type="text" maxLength={60} value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} aria-label="Nombre" /></td>
                  <td><input type="text" maxLength={20} value={editando.corto} onChange={(e) => setEditando({ ...editando, corto: e.target.value })} aria-label="Abreviado" /></td>
                  <td>
                    <select value={editando.tipo} onChange={(e) => setEditando({ ...editando, tipo: e.target.value as 'Equipo' | 'Accesorio' })} aria-label="Tipo">
                      <option value="Equipo">Equipo</option>
                      <option value="Accesorio">Accesorio</option>
                    </select>
                  </td>
                  <td colSpan={2}>
                    <div className="pills">
                      <button type="button" onClick={guardarEdicion}>Guardar</button>
                      <button type="button" onClick={() => setEditando(null)}>Cancelar</button>
                      <button type="button" onClick={() => eliminar(p)}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={p.id} className={p.activo ? undefined : 'pend'}>
                  <td className={p.activo ? 'b' : 's-mut'}>{p.nombre}</td>
                  <td className="s-mut">{p.corto}</td>
                  <td className="s-mut">{p.tipo}</td>
                  <td>
                    <div className="pills"><button type="button" aria-pressed={p.activo} onClick={() => alternar(p)}>{p.activo ? 'Se pide' : 'Oculto'}</button></div>
                  </td>
                  <td>
                    <div className="pills"><button type="button" onClick={() => { setEstado(null); setEditando({ id: p.id, nombre: p.nombre, corto: p.corto, tipo: p.tipo }); }}>Editar</button></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card bit-form">
        <div className="ch"><h2>Agregar producto</h2></div>
        <label className="bit-lbl">Nombre
          <input type="text" maxLength={60} value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Ej. Honor Magic 8 Pro" />
        </label>
        <div className="bit-grid">
          <label className="bit-lbl">Abreviado (columna)
            <input type="text" maxLength={20} value={nuevo.corto} onChange={(e) => setNuevo({ ...nuevo, corto: e.target.value })} placeholder="Ej. Magic 8 Pro" />
          </label>
          <label className="bit-lbl">Tipo
            <select value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value as 'Equipo' | 'Accesorio' })}>
              <option value="Equipo">Equipo</option>
              <option value="Accesorio">Accesorio</option>
            </select>
          </label>
        </div>
        {estado && <div className={'msg ' + (estado.ok ? 'o' : 'e')}>{estado.texto}</div>}
        <button className="abtn" type="button" onClick={agregar}>Agregar a la Foto</button>
        <span className="hint">Un producto oculto deja de pedirse, pero lo ya registrado se mantiene en las semanas anteriores. Las respuestas ya enviadas conservan la lista con la que se llenaron. Con el botón Editar corriges nombre, abreviado o tipo; solo se puede eliminar un producto que todavía no aparece en ninguna respuesta.</span>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------
// Prioridades por cluster (admin)
// ---------------------------------------------------------------------
function Prioridades({ productos, prioridades, onCambio, supabase }: {
  productos: FotoProducto[]; prioridades: FotoPrioridad[]; onCambio: (p: FotoPrioridad[]) => void; supabase: ReturnType<typeof createClient>;
}) {
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null);
  const equipos = productos.filter((p) => p.activo).sort((a, b) => (a.tipo === b.tipo ? a.orden - b.orden : a.tipo === 'Equipo' ? -1 : 1));
  const valor = (pid: number, c: string) => prioridades.find((x) => x.producto_id === pid && x.cluster === c)?.numero ?? null;

  async function cambiar(p: FotoProducto, cluster: string, texto: string) {
    const n = texto.trim() === '' ? null : parseInt(texto, 10);
    if (n === valor(p.id, cluster)) return;
    if (n != null && !(n >= 1 && n <= 999)) { setEstado({ ok: false, texto: 'El número debe estar entre 1 y 999, o vacío si no se exige.' }); return; }
    const q = n == null
      ? supabase.from('foto_prioridades').delete().eq('producto_id', p.id).eq('cluster', cluster)
      : supabase.from('foto_prioridades').upsert({ producto_id: p.id, cluster, numero: n });
    const { error } = await q;
    if (error) { setEstado({ ok: false, texto: `No se pudo guardar: ${error.message}` }); return; }
    const resto = prioridades.filter((x) => !(x.producto_id === p.id && x.cluster === cluster));
    onCambio(n == null ? resto : [...resto, { producto_id: p.id, cluster, numero: n }]);
    setEstado({ ok: true, texto: n == null ? `${p.nombre} ya no se exige en cluster ${cluster}.` : `${p.nombre}: Nro. ${n} en cluster ${cluster}.` });
  }

  return (
    <section className="card">
      <div className="ch">
        <h2>Prioridades por cluster</h2>
        <span className="hint">Nro. de cada equipo exigido en tiendas K, A, B y C. Vacío = no se exige en ese cluster.</span>
      </div>
      <div className="x">
        <table className="htab foto-prio">
          <thead><tr><th>Producto</th>{CLUSTERS.map((c) => <th key={c}>Tiendas {c}</th>)}</tr></thead>
          <tbody>
            {equipos.map((p) => (
              <tr key={p.id}>
                <td className="b">{p.nombre}</td>
                {CLUSTERS.map((c) => (
                  <td key={c}>
                    <input type="number" min={1} max={999} inputMode="numeric" aria-label={`Nro. de ${p.nombre} en cluster ${c}`}
                      defaultValue={valor(p.id, c) ?? ''} onBlur={(e) => cambiar(p, c, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {estado && <div className={'msg ' + (estado.ok ? 'o' : 'e')}>{estado.texto}</div>}
      <span className="hint">Los cambios se aplican a las respuestas nuevas o corregidas desde ahora; las semanas ya enviadas conservan sus exigidos.</span>
    </section>
  );
}
