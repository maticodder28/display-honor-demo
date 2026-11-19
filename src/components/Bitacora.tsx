'use client';
import { useMemo, useState, type CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { BitAccion, BitEjecutivo, BitPerfil, BitTienda } from '@/lib/data';

// ---------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------
const TIPOS = [
  { id: 'visita', label: 'Visita', color: '#60a5fa', placeholder: 'Qué se revisó: exhibición, stock, precios, material POP...' },
  { id: 'venta', label: 'Venta ejecutivo', color: '#22c55e', placeholder: 'Opcional: modelos vendidos, período (ej. semana 41)...' },
  { id: 'incentivo', label: 'Incentivo / regalo', color: '#ff7a1a', placeholder: 'Qué se entregó y por qué (ej. audífonos por meta mensual)...' },
  { id: 'capacitacion', label: 'Capacitación', color: '#2dd4bf', placeholder: 'Producto o tema y cuántos ejecutivos asistieron...' },
  { id: 'implementacion', label: 'Implementación', color: '#a78bfa', placeholder: 'Mueble, demo o material instalado o corregido...' },
  { id: 'observacion', label: 'Observación', color: '#eab308', placeholder: 'Algo a tener en cuenta: quiebre de stock, competencia, reclamo...' },
] as const;
type TipoId = (typeof TIPOS)[number]['id'];
const TIPO = Object.fromEntries(TIPOS.map((t) => [t.id, t])) as Record<string, (typeof TIPOS)[number]>;
const COLORES_USUARIO = ['#ff7a1a', '#60a5fa', '#2dd4bf', '#a78bfa', '#f472b6', '#eab308'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** Nivel del ejecutivo según su parte de los equipos Honor vendidos en la tienda en el mes. */
const NIVEL_ALTO = 0.4, NIVEL_MEDIO = 0.15;
/** Sobre estos valores se pide confirmar, para evitar errores de tipeo. */
const UNIDADES_ALTAS = 50, COSTO_ALTO = 200000;

const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const fmt = (f: string) => `${Number(f.slice(8, 10))} ${MES_CORTO[Number(f.slice(5, 7)) - 1]}`;
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

type Estado = { corto: string; largo: string; cls: 'ok' | 'warn' | 'bad'; dias: number };

interface Props {
  hoy: string;
  usuario: { id: string; nombre: string; puedeRegistrar: boolean; esAdmin: boolean };
  tiendas: BitTienda[];
  ejecutivos: BitEjecutivo[];
  acciones: BitAccion[];
  perfiles: BitPerfil[];
}

export default function Bitacora({ hoy, usuario, tiendas, ejecutivos: ejecutivosIni, acciones: accionesIni, perfiles }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [acciones, setAcciones] = useState<BitAccion[]>(accionesIni);
  const [ejecutivos, setEjecutivos] = useState<BitEjecutivo[]>(ejecutivosIni);
  const [sel, setSel] = useState(tiendas[0]?.codigo ?? '');
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<'todas' | 'sinvisita' | 'pendientes'>('todas');
  const [filtroAutor, setFiltroAutor] = useState('todos');
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [form, setForm] = useState({ tipo: 'visita' as TipoId, fecha: hoy, ejecutivo: '', detalle: '', unidades: '', costo: '', pendiente: false });
  const [nuevoEj, setNuevoEj] = useState('');
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [generando, setGenerando] = useState(false);

  const dias = (f: string) => Math.round((Date.parse(hoy) - Date.parse(f)) / 86400000);

  // Personas: nombre, cargo y un color estable
  const personas = useMemo(() => {
    const m = new Map<string, { nombre: string; cargo: string; color: string; ini: string }>();
    [...perfiles].sort((a, b) => a.id.localeCompare(b.id)).forEach((p, i) => {
      const nombre = p.nombre || 'Usuario';
      m.set(p.id, { nombre, cargo: p.cargo || '', color: COLORES_USUARIO[i % COLORES_USUARIO.length], ini: nombre.slice(0, 1).toUpperCase() });
    });
    return m;
  }, [perfiles]);
  const persona = (id: string) => personas.get(id) ?? { nombre: 'Usuario', cargo: '', color: '#8d8d98', ini: '?' };
  const ejNombre = useMemo(() => new Map(ejecutivos.map((e) => [e.id, e.nombre])), [ejecutivos]);

  const porTienda = useMemo(() => {
    const m = new Map<string, BitAccion[]>();
    for (const a of acciones) {
      if (!m.has(a.tienda_codigo)) m.set(a.tienda_codigo, []);
      m.get(a.tienda_codigo)!.push(a);
    }
    m.forEach((l) => l.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.id - a.id)));
    return m;
  }, [acciones]);

  // Cualquier acción registrada en la tienda cuenta como visita (una por tienda y día).
  const estadoDe = (lista: BitAccion[]): Estado => {
    const v = lista[0];
    if (!v) return { corto: 'Sin visita', largo: 'Sin visitas registradas', cls: 'bad', dias: 9999 };
    const d = dias(v.fecha);
    if (d <= 7) return { corto: 'Al día', largo: `Visitada hace ${plural(d, 'día', 'días')}`, cls: 'ok', dias: d };
    if (d <= 14) return { corto: `${d} días`, largo: `Visitada hace ${d} días`, cls: 'warn', dias: d };
    return { corto: `${d} días`, largo: `Sin visita hace ${d} días`, cls: 'bad', dias: d };
  };

  const filas = tiendas.map((t) => {
    const lista = porTienda.get(t.codigo) ?? [];
    return { t, lista, est: estadoDe(lista), pend: lista.filter((a) => a.pendiente && !a.hecho).length };
  });

  // Meses disponibles para el selector
  const meses = useMemo(() => {
    const s = new Set<string>([hoy.slice(0, 7)]);
    acciones.forEach((a) => s.add(a.fecha.slice(0, 7)));
    return [...s].sort().reverse();
  }, [acciones, hoy]);
  const enMes = (a: BitAccion) => a.fecha.slice(0, 7) === mes;

  // KPIs del mes
  let gasto = 0, nInc = 0, equipos = 0;
  const diasVisita = new Set<string>();
  for (const a of acciones) {
    if (!enMes(a)) continue;
    diasVisita.add(`${a.tienda_codigo}|${a.fecha}`);
    if (a.tipo === 'incentivo') { gasto += a.costo ?? 0; nInc++; }
    if (a.tipo === 'venta') equipos += a.unidades ?? 0;
  }
  const visitasMes = diasVisita.size;
  const pendTot = filas.reduce((n, f) => n + f.pend, 0);
  const sinVisita = filas.filter((f) => f.est.dias > 14).length;

  // Listado de tiendas
  const qq = q.trim().toLowerCase();
  const lista = filas
    .filter((f) => (filtro === 'sinvisita' ? f.est.dias > 14 : filtro === 'pendientes' ? f.pend > 0 : true))
    .filter((f) => !qq || `${f.t.nombre} ${f.t.codigo} ${f.t.ciudad} ${f.t.cliente}`.toLowerCase().includes(qq))
    .sort((a, b) => b.est.dias - a.est.dias || a.t.nombre.localeCompare(b.t.nombre));

  // Tienda seleccionada
  const actual = filas.find((f) => f.t.codigo === sel) ?? filas[0];
  if (!actual) {
    return (
      <section className="card state">
        <h2>No hay tiendas cargadas</h2>
        <p>La bitácora usa el listado de tiendas del Excel. Sube el Excel desde Admin para empezar.</p>
      </section>
    );
  }
  const st = actual.t;
  const accs = actual.lista;
  const ejsTienda = ejecutivos.filter((e) => e.tienda_codigo === st.codigo && e.activo);
  const ejsBaja = ejecutivos.filter((e) => e.tienda_codigo === st.codigo && !e.activo);
  const pendientes = accs.filter((a) => a.pendiente).sort((a, b) => Number(a.hecho) - Number(b.hecho));
  const abiertos = pendientes.filter((a) => !a.hecho).length;

  // Ranking del mes
  const ventasMes = accs.filter((a) => a.tipo === 'venta' && enMes(a));
  const totalTienda = ventasMes.reduce((n, a) => n + (a.unidades ?? 0), 0);
  const gastoTienda = accs.filter((a) => a.tipo === 'incentivo' && enMes(a)).reduce((n, a) => n + (a.costo ?? 0), 0);
  // Activos, más los dados de baja que tuvieron ventas o incentivos en el mes.
  const conMovimiento = new Set(accs.filter((a) => enMes(a) && a.ejecutivo_id).map((a) => a.ejecutivo_id));
  const ranking = [...ejsTienda, ...ejsBaja.filter((e) => conMovimiento.has(e.id))].map((e) => {
    const vs = ventasMes.filter((a) => a.ejecutivo_id === e.id);
    const u = vs.reduce((n, a) => n + (a.unidades ?? 0), 0);
    const incs = accs.filter((a) => a.tipo === 'incentivo' && a.ejecutivo_id === e.id);
    const share = totalTienda ? u / totalTienda : 0;
    const nivel = !u ? 'Sin ventas' : share >= NIVEL_ALTO ? 'Alto' : share >= NIVEL_MEDIO ? 'Medio' : 'Bajo';
    return { e, u, share, nivel, registros: vs.length, incs, costo: incs.reduce((n, a) => n + (a.costo ?? 0), 0) };
  }).sort((a, b) => b.u - a.u || a.e.nombre.localeCompare(b.e.nombre));
  const nivelCls: Record<string, string> = { Alto: 'ok', Medio: 'warn', Bajo: 'bad', 'Sin ventas': 'mut' };

  const historial = accs.filter((a) => filtroAutor === 'todos' || a.creado_por === filtroAutor);
  const autores = [...new Set(accs.map((a) => a.creado_por))];

  // -------------------------------------------------------------------
  // Escrituras
  // -------------------------------------------------------------------
  const set = (p: Partial<typeof form>) => { setForm((f) => ({ ...f, ...p })); setAviso(null); };

  async function guardar() {
    const u = parseInt(form.unidades, 10), c = parseInt(form.costo, 10);
    const err =
      form.tipo === 'venta' && !form.ejecutivo ? 'Elige el ejecutivo que hizo la venta.'
        : form.tipo === 'venta' && !(u > 0) ? 'Ingresa cuántos equipos vendió.'
          : form.tipo === 'incentivo' && !(c >= 0) ? 'Ingresa el costo del incentivo (puede ser 0).'
            : form.tipo !== 'venta' && !form.detalle.trim() ? 'Escribe el detalle antes de guardar.'
              : !form.fecha ? 'Elige la fecha.'
                : form.fecha > hoy ? 'La fecha no puede ser futura.' : null;
    if (err) { setAviso({ ok: false, texto: err }); return; }
    if (form.tipo === 'venta' && u > UNIDADES_ALTAS && !window.confirm(`¿Confirmas ${u} equipos vendidos? Es una cantidad alta para un solo registro.`)) return;
    if (form.tipo === 'incentivo' && c > COSTO_ALTO && !window.confirm(`¿Confirmas un costo de ${clp.format(c)}? Es un monto alto para un incentivo.`)) return;
    setGuardando(true);
    const { data, error } = await supabase.from('acciones').insert({
      tienda_codigo: st.codigo,
      fecha: form.fecha,
      tipo: form.tipo,
      ejecutivo_id: form.ejecutivo ? Number(form.ejecutivo) : null,
      detalle: form.detalle.trim(),
      unidades: form.tipo === 'venta' ? u : null,
      costo: form.tipo === 'incentivo' ? c : null,
      pendiente: form.pendiente,
    }).select('id, tienda_codigo, fecha, tipo, ejecutivo_id, detalle, unidades, costo, pendiente, hecho, creado_por, created_at').single();
    setGuardando(false);
    if (error || !data) { setAviso({ ok: false, texto: `No se pudo guardar: ${error?.message ?? 'error desconocido'}` }); return; }
    setAcciones((l) => [data as BitAccion, ...l]);
    setForm((f) => ({ ...f, ejecutivo: '', detalle: '', unidades: '', costo: '', pendiente: false }));
    setAviso({ ok: true, texto: 'Guardado en el historial.' });
  }

  async function agregarEjecutivo() {
    const nombre = nuevoEj.trim();
    if (nombre.length < 2) return;
    const clave = (s: string) => s.trim().toLowerCase();
    const antiguo = ejsBaja.find((e) => clave(e.nombre) === clave(nombre));
    if (antiguo) {
      await cambiarEstado(antiguo, true);
      setNuevoEj('');
      return;
    }
    const { data, error } = await supabase.from('ejecutivos').insert({ tienda_codigo: st.codigo, nombre }).select('id, tienda_codigo, nombre, activo').single();
    if (error || !data) {
      setAviso({ ok: false, texto: error?.code === '23505' ? `${nombre} ya está registrado en esta tienda.` : `No se pudo agregar: ${error?.message}` });
      return;
    }
    setEjecutivos((l) => [...l, data as BitEjecutivo]);
    setNuevoEj('');
  }

  async function cambiarEstado(e: BitEjecutivo, activo: boolean) {
    if (!activo && !window.confirm(`¿Dar de baja a ${e.nombre}? Deja de aparecer para nuevos registros. Sus ventas e incentivos ya registrados se conservan en el historial y los reportes.`)) return;
    const { error } = await supabase.rpc('cambiar_estado_ejecutivo', { p_id: e.id, p_activo: activo });
    if (error) {
      setAviso({ ok: false, texto: error.code === '23505' ? `Ya hay un ejecutivo activo llamado ${e.nombre} en esta tienda.` : `No se pudo actualizar: ${error.message}` });
      return;
    }
    setEjecutivos((l) => l.map((x) => (x.id === e.id ? { ...x, activo } : x)));
    if (!activo && form.ejecutivo === String(e.id)) set({ ejecutivo: '' });
    setAviso({ ok: true, texto: activo ? `${e.nombre} vuelve a estar activo.` : `${e.nombre} quedó dado de baja.` });
  }

  async function marcar(a: BitAccion) {
    const { error } = await supabase.rpc('marcar_pendiente', { p_id: a.id, p_hecho: !a.hecho });
    if (error) { setAviso({ ok: false, texto: `No se pudo actualizar: ${error.message}` }); return; }
    setAcciones((l) => l.map((x) => (x.id === a.id ? { ...x, hecho: !a.hecho } : x)));
  }

  async function borrar(a: BitAccion) {
    if (!window.confirm('¿Eliminar este registro del historial? No se puede deshacer.')) return;
    const { error, count } = await supabase.from('acciones').delete({ count: 'exact' }).eq('id', a.id);
    if (error || !count) { setAviso({ ok: false, texto: 'No se pudo eliminar el registro.' }); return; }
    setAcciones((l) => l.filter((x) => x.id !== a.id));
  }

  const tipoActual = TIPO[form.tipo];

  async function descargarReporte() {
    setGenerando(true);
    try {
      const [{ generarReporteBitacora }, { descargarXlsx }] = await Promise.all([import('@/lib/reporteBitacora'), import('@/lib/excel')]);
      const buf = await generarReporteBitacora({
        hoy, mes, zona: process.env.NEXT_PUBLIC_ZONA || 'Norte', generadoPor: usuario.nombre,
        tiendas, ejecutivos, acciones, perfiles,
      });
      descargarXlsx(buf, `Bitacora_${process.env.NEXT_PUBLIC_ZONA || 'Norte'}_${mes}.xlsx`);
    } catch {
      window.alert('No se pudo generar el reporte. Intenta de nuevo.');
    } finally {
      setGenerando(false);
    }
  }

  return (
    <>
      <header className="top">
        <div>
          <h1>Bitácora de tiendas</h1>
          <p className="take">Lo que hace el equipo en cada punto de venta: visitas, ventas por ejecutivo, incentivos, capacitaciones y pendientes.</p>
        </div>
        <div className="fg">
          <label className="fl" htmlFor="bit-mes">Mes</label>
          <select id="bit-mes" value={mes} onChange={(e) => setMes(e.target.value)}>
            {meses.map((m) => <option key={m} value={m}>{nombreMes(m)}</option>)}
          </select>
          <button className="abtn" type="button" onClick={descargarReporte} disabled={generando}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 2v8m0 0L5 7m3 3 3-3M3 13h10" /></svg>
            {generando ? 'Generando...' : 'Descargar reporte'}
          </button>
        </div>
      </header>

      <section className="kpis">
        <div className="card kpi"><div className="kl">Visitas</div><div className="kv">{visitasMes}</div><div className="ks">{nombreMes(mes)}</div></div>
        <div className="card kpi"><div className="kl">Sin visita +14 días</div><div className={'kv s-' + (sinVisita ? 'bad' : 'ok')}>{sinVisita}</div><div className="ks">de {tiendas.length} tiendas activas</div></div>
        <div className="card kpi"><div className="kl">Equipos registrados</div><div className="kv s-ok">{equipos}</div><div className="ks">ventas de ejecutivos en el mes</div></div>
        <div className="card kpi"><div className="kl">Incentivos</div><div className="kv s-acc">{clp.format(gasto)}</div><div className="ks">{plural(nInc, 'entrega', 'entregas')} en el mes</div></div>
        <div className="card kpi"><div className="kl">Pendientes abiertos</div><div className={'kv s-' + (pendTot ? 'warn' : 'ok')}>{pendTot}</div><div className="ks">en todas las tiendas</div></div>
      </section>

      <div className="bit">
        <section className="card bit-lista" aria-label="Tiendas">
          <div className="bit-lista-h">
            <label className="fl" htmlFor="bit-q">Tiendas | {lista.length} de {tiendas.length}</label>
            <input id="bit-q" type="search" placeholder="Buscar tienda, código o ciudad..." value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="pills">
              {([['todas', 'Todas'], ['sinvisita', 'Sin visita reciente'], ['pendientes', 'Con pendientes']] as const).map(([v, l]) => (
                <button key={v} type="button" aria-pressed={filtro === v} onClick={() => setFiltro(v)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="bit-lista-b">
            {lista.map((f) => (
              <button key={f.t.codigo} type="button" className={'bit-row' + (f.t.codigo === st.codigo ? ' on' : '')}
                onClick={() => { setSel(f.t.codigo); setFiltroAutor('todos'); setAviso(null); set({ ejecutivo: '' }); }}>
                <span className="bit-row-t">
                  <b>{f.t.nombre}</b>
                  <span className="code">{f.t.codigo} | {f.t.ciudad}</span>
                </span>
                <span className="bit-row-e">
                  <span className={'badge b-' + f.est.cls}>{f.est.corto}</span>
                  <span className="hint">{plural(f.lista.length, 'acción', 'acciones')}{f.pend ? ` | ${f.pend} pend.` : ''}</span>
                </span>
              </button>
            ))}
            {!lista.length && <div className="empty" style={{ padding: 14 }}>No hay tiendas con ese filtro.</div>}
          </div>
        </section>

        <div className="bit-det">
          <section className="card bit-head">
            <div className="cobh">
              <div className="av">{st.cliente.slice(0, 2).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <b>{st.nombre}</b>
                <span><span className="code">{st.codigo}</span> | {st.cliente} | {st.ciudad} | {st.cobertura}</span>
              </div>
              <span className={'badge b-' + actual.est.cls}>{actual.est.largo}</span>
            </div>
            <div className="bit-stats">
              <div><span className="kl">Última visita</span><b>{accs[0] ? fmt(accs[0].fecha) : '-'}</b></div>
              <div><span className="kl">Equipos | {MES_CORTO[Number(mes.slice(5, 7)) - 1]}</span><b>{totalTienda}</b></div>
              <div><span className="kl">Incentivos | {MES_CORTO[Number(mes.slice(5, 7)) - 1]}</span><b>{clp.format(gastoTienda)}</b></div>
              <div><span className="kl">Ejecutivos</span><b>{ejsTienda.length}</b></div>
              <div><span className="kl">Acciones</span><b>{accs.length}</b></div>
            </div>
          </section>

          <div className="bit-two">
            {usuario.puedeRegistrar ? (
              <section className="card bit-form">
                <h2>Registrar acción</h2>
                <div className="bit-tipos" role="group" aria-label="Tipo de acción">
                  {TIPOS.map((t) => (
                    <button key={t.id} type="button" className="bit-tipo" aria-pressed={form.tipo === t.id} onClick={() => set({ tipo: t.id })}>
                      <i style={{ background: t.color }} />{t.label}
                    </button>
                  ))}
                </div>
                <div className="bit-grid">
                  <label className="bit-lbl">Fecha
                    <input type="date" value={form.fecha} max={hoy} onChange={(e) => set({ fecha: e.target.value })} />
                  </label>
                  <label className="bit-lbl">
                    {form.tipo === 'venta' ? 'Ejecutivo' : form.tipo === 'incentivo' ? 'Ejecutivo que lo recibe' : 'Ejecutivo (opcional)'}
                    <select value={form.ejecutivo} onChange={(e) => set({ ejecutivo: e.target.value })}>
                      <option value="">{ejsTienda.length ? 'Sin ejecutivo' : 'Agrega ejecutivos abajo'}</option>
                      {ejsTienda.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                    </select>
                  </label>
                  {form.tipo === 'venta' && (
                    <label className="bit-lbl">Equipos Honor vendidos
                      <input type="number" min={1} step={1} inputMode="numeric" placeholder="Ej. 4" value={form.unidades} onChange={(e) => set({ unidades: e.target.value })} />
                    </label>
                  )}
                  {form.tipo === 'incentivo' && (
                    <label className="bit-lbl">Costo del incentivo (CLP)
                      <input type="number" min={0} step={500} inputMode="numeric" placeholder="Ej. 15000" value={form.costo} onChange={(e) => set({ costo: e.target.value })} />
                    </label>
                  )}
                </div>
                <label className="bit-lbl">{form.tipo === 'venta' ? 'Nota (opcional)' : 'Detalle'}
                  <textarea rows={3} placeholder={tipoActual.placeholder} value={form.detalle} maxLength={2000} onChange={(e) => set({ detalle: e.target.value })} />
                </label>
                <label className="bit-check">
                  <input type="checkbox" checked={form.pendiente} onChange={(e) => set({ pendiente: e.target.checked })} />
                  Dejar como pendiente (to-do)
                </label>
                <div className="row">
                  <button type="button" className="abtn" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar acción'}</button>
                  {aviso && <span className={'hint s-' + (aviso.ok ? 'ok' : 'warn')}>{aviso.texto}</span>}
                </div>
              </section>
            ) : (
              <section className="card">
                <h2>Solo lectura</h2>
                <p className="hint" style={{ lineHeight: 1.5 }}>Tu usuario puede ver la bitácora pero no registrar acciones. Pídele al administrador que te asigne el rol de registro.</p>
              </section>
            )}

            <section className="card bit-pend">
              <div className="ch"><h2>Pendientes</h2><span className="hint">{plural(abiertos, 'abierto', 'abiertos')}</span></div>
              {pendientes.map((a) => (
                <div key={a.id} className={'bit-p' + (a.hecho ? ' hecho' : '')}>
                  <button type="button" className={'bit-chk' + (a.hecho ? ' on' : '')} aria-pressed={a.hecho}
                    aria-label={a.hecho ? 'Reabrir pendiente' : 'Marcar como hecho'} disabled={!usuario.puedeRegistrar} onClick={() => marcar(a)}>
                    {a.hecho && <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M3 8.5l3 3 7-7" /></svg>}
                  </button>
                  <div>
                    <div className="bit-p-t">{a.detalle || TIPO[a.tipo]?.label}</div>
                    <div className="hint">{TIPO[a.tipo]?.label} | {fmt(a.fecha)} | {persona(a.creado_por).nombre}{a.ejecutivo_id ? ` | ${ejNombre.get(a.ejecutivo_id) ?? ''}` : ''}{a.hecho ? ' | hecho' : ''}</div>
                  </div>
                </div>
              ))}
              {!pendientes.length && <div className="empty">Sin pendientes en esta tienda.</div>}
            </section>
          </div>

          <section className="card">
            <div className="ch">
              <h2>Ranking de ejecutivos | {nombreMes(mes)}</h2>
              <span className="hint">Según las ventas registradas. Alto: 40% o más de los equipos Honor de la tienda | Medio: 15-39% | Bajo: menos de 15%</span>
            </div>
            <div className="x">
              <table className="det bit-rank">
                <thead><tr>
                  <th className="l">#</th><th className="l">Ejecutivo</th><th>Equipos</th><th className="l">% de la tienda</th><th className="l">Nivel</th><th>Incentivos recibidos</th>
                </tr></thead>
                <tbody>
                  {ranking.map((r, i) => {
                    const prev = ranking[i - 1];
                    const puesto = !r.u ? '-' : prev && prev.u === r.u ? '=' : String(i + 1);
                    return (
                      <tr key={r.e.id}>
                        <td className="l st s-mut">{puesto}</td>
                        <td className="l">
                          <b>{r.e.nombre}</b>{!r.e.activo && <span className="badge b-mut bit-baja">De baja</span>}
                          <div className="hint">
                            {r.registros ? plural(r.registros, 'registro de venta', 'registros de venta') : 'Sin ventas en el mes'}
                            {usuario.puedeRegistrar && r.e.activo && <> | <button type="button" className="bit-del bit-inline" onClick={() => cambiarEstado(r.e, false)}>Dar de baja</button></>}
                          </div>
                        </td>
                        <td className="st">{r.u}</td>
                        <td className="l">
                          <div className="bit-bar"><div className="track"><div className={'fill b-' + nivelCls[r.nivel]} style={{ width: `${Math.round(r.share * 100)}%` }} /></div><span>{totalTienda ? `${Math.round(r.share * 100)}%` : '-'}</span></div>
                        </td>
                        <td className="l"><span className={'badge b-' + nivelCls[r.nivel]}>{r.nivel}</span></td>
                        <td>{r.incs.length ? clp.format(r.costo) : '-'}{r.incs.length > 0 && <div className="hint">{plural(r.incs.length, 'entrega', 'entregas')} | último {fmt(r.incs[0].fecha)}</div>}</td>
                      </tr>
                    );
                  })}
                  {!ranking.length && <tr><td className="l empty" colSpan={6}>Sin ejecutivos registrados en esta tienda.</td></tr>}
                </tbody>
              </table>
            </div>
            {ejsBaja.length > 0 && (
              <details className="bit-bajas">
                <summary>{plural(ejsBaja.length, 'ejecutivo dado de baja', 'ejecutivos dados de baja')} en esta tienda</summary>
                <ul>
                  {ejsBaja.map((e) => (
                    <li key={e.id}>
                      <span>{e.nombre}</span>
                      {usuario.puedeRegistrar && <button type="button" className="ibtn" onClick={() => cambiarEstado(e, true)}>Reactivar</button>}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {usuario.puedeRegistrar && (
              <div className="row" style={{ marginTop: 12, alignItems: 'flex-end' }}>
                <label className="bit-lbl" style={{ flex: '1 1 220px' }}>Agregar ejecutivo a esta tienda
                  <input type="text" placeholder="Nombre y apellido" maxLength={80} value={nuevoEj} onChange={(e) => setNuevoEj(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') agregarEjecutivo(); }} />
                </label>
                <button type="button" className="abtn ghost" onClick={agregarEjecutivo} disabled={nuevoEj.trim().length < 2}>Agregar</button>
              </div>
            )}
          </section>

          <section className="card">
            <div className="ch">
              <div><h2>Historial</h2><span className="hint">{accs.length ? `${historial.length} de ${accs.length} registros, del más reciente al más antiguo` : 'Sin registros todavía'}</span></div>
              {autores.length > 1 && (
                <div className="pills" role="group" aria-label="Registrado por">
                  <button type="button" aria-pressed={filtroAutor === 'todos'} onClick={() => setFiltroAutor('todos')}>Todos</button>
                  {autores.map((id) => (
                    <button key={id} type="button" aria-pressed={filtroAutor === id} onClick={() => setFiltroAutor(id)}>{persona(id).nombre}</button>
                  ))}
                </div>
              )}
            </div>
            {historial.map((a) => {
              const p = persona(a.creado_por), t = TIPO[a.tipo];
              const dato = a.tipo === 'venta' ? plural(a.unidades ?? 0, 'equipo', 'equipos') : a.tipo === 'incentivo' ? clp.format(a.costo ?? 0) : '';
              const puedeBorrar = usuario.puedeRegistrar && (a.creado_por === usuario.id || usuario.esAdmin);
              return (
                <div key={a.id} className="bit-h">
                  <div className="hint bit-h-f">{fmt(a.fecha)}</div>
                  <i style={{ background: t?.color }} />
                  <div>
                    <div className="bit-h-m">
                      <b style={{ '--c': t?.color } as CSSProperties}>{t?.label ?? a.tipo}</b>
                      {a.ejecutivo_id && <span className="hint">| {ejNombre.get(a.ejecutivo_id) ?? 'ejecutivo'}</span>}
                      {dato && <b>{dato}</b>}
                      {a.pendiente && !a.hecho && <span className="badge b-warn">Pendiente</span>}
                    </div>
                    {a.detalle && <div className="bit-h-d">{a.detalle}</div>}
                    <div className="hint bit-h-a">
                      <span className="bit-av" style={{ background: p.color }}>{p.ini}</span>
                      Registrado por {p.nombre}{p.cargo ? ` | ${p.cargo}` : ''}
                      {puedeBorrar && <button type="button" className="bit-del" onClick={() => borrar(a)}>Eliminar</button>}
                    </div>
                  </div>
                </div>
              );
            })}
            {accs.length > 0 && !historial.length && <div className="empty">No hay registros con este filtro.</div>}
          </section>
        </div>
      </div>
    </>
  );
}
