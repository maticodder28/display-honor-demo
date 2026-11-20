'use client';
import { useMemo, useState } from 'react';
import {
  agruparPorTienda, estadoVisita, mesesDisponibles, pendientesAbiertos, resumenMes, sinVisitaReciente, type DatosBitacora,
} from '@/dominio/bitacora/bitacora';
import { ZONA } from '@/config';
import { puedeBorrarAccion, type Usuario } from '@/dominio/usuario';
import FormularioAccion from './FormularioAccion';
import { COLORES_USUARIO, PERSONA_DESCONOCIDA, clp, fechaCorta, mesCorto, nombreMes, plural, type Persona } from './formato';
import HistorialAcciones from './HistorialAcciones';
import ListaTiendas, { type FilaTienda, type Filtro } from './ListaTiendas';
import Pendientes from './Pendientes';
import Ranking from './Ranking';
import { useBitacora } from './useBitacora';

interface Props extends DatosBitacora {
  hoy: string;
  usuario: Usuario;
}

/** Pantalla de la bitácora: arma la lista de tiendas y el detalle de la elegida. */
export default function Bitacora({ hoy, usuario, tiendas, perfiles, ...inicial }: Props) {
  const b = useBitacora(inicial);
  const { acciones, ejecutivos } = b;
  const [sel, setSel] = useState(tiendas[0]?.codigo ?? '');
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [generando, setGenerando] = useState(false);

  // Cada persona con un color fijo (ordeno por id para que no cambie entre visitas).
  const personas = useMemo(() => {
    const m = new Map<string, Persona>();
    [...perfiles].sort((a, b) => a.id.localeCompare(b.id)).forEach((p, i) => {
      const nombre = p.nombre || 'Usuario';
      m.set(p.id, { nombre, cargo: p.cargo || '', color: COLORES_USUARIO[i % COLORES_USUARIO.length], ini: nombre.slice(0, 1).toUpperCase() });
    });
    return m;
  }, [perfiles]);
  const persona = (id: string) => personas.get(id) ?? PERSONA_DESCONOCIDA;
  const nombresEjecutivos = useMemo(() => new Map(ejecutivos.map((e) => [e.id, e.nombre])), [ejecutivos]);
  const ejecutivo = (id: number) => nombresEjecutivos.get(id);

  const porTienda = useMemo(() => agruparPorTienda(acciones), [acciones]);
  const filas: FilaTienda[] = tiendas.map((t) => {
    const lista = porTienda.get(t.codigo) ?? [];
    return { t, lista, est: estadoVisita(lista, hoy), pend: pendientesAbiertos(lista) };
  });
  const meses = useMemo(() => mesesDisponibles(acciones, hoy), [acciones, hoy]);
  const kpi = resumenMes(acciones, mes);
  const pendientesTotal = filas.reduce((n, f) => n + f.pend, 0);
  const sinVisita = filas.filter((f) => sinVisitaReciente(f.est)).length;

  // Las tiendas más abandonadas primero.
  const texto = q.trim().toLowerCase();
  const visibles = filas
    .filter((f) => (filtro === 'sinvisita' ? sinVisitaReciente(f.est) : filtro === 'pendientes' ? f.pend > 0 : true))
    .filter((f) => !texto || `${f.t.nombre} ${f.t.codigo} ${f.t.ciudad} ${f.t.cliente}`.toLowerCase().includes(texto))
    .sort((a, b) => b.est.dias - a.est.dias || a.t.nombre.localeCompare(b.t.nombre));

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
  const ejsTienda = ejecutivos.filter((e) => e.tienda_codigo === st.codigo);
  const activos = ejsTienda.filter((e) => e.activo);
  const delMes = (tipo: string) => accs.filter((a) => a.tipo === tipo && a.fecha.slice(0, 7) === mes);
  const equiposTienda = delMes('venta').reduce((n, a) => n + (a.unidades ?? 0), 0);
  const gastoTienda = delMes('incentivo').reduce((n, a) => n + (a.costo ?? 0), 0);

  async function descargarReporte() {
    setGenerando(true);
    try {
      const [{ generarReporteBitacora }, { descargarXlsx }] = await Promise.all([
        import('@/infraestructura/excel/reporteBitacora'), import('@/infraestructura/excel/levantamiento'),
      ]);
      const buf = await generarReporteBitacora({ hoy, mes, zona: ZONA, generadoPor: usuario.nombre, tiendas, ejecutivos, acciones, perfiles });
      descargarXlsx(buf, `Bitacora_${ZONA}_${mes}.xlsx`);
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
        <div className="card kpi"><div className="kl">Visitas</div><div className="kv">{kpi.visitas}</div><div className="ks">{nombreMes(mes)}</div></div>
        <div className="card kpi"><div className="kl">Sin visita +14 días</div><div className={'kv s-' + (sinVisita ? 'bad' : 'ok')}>{sinVisita}</div><div className="ks">de {tiendas.length} tiendas activas</div></div>
        <div className="card kpi"><div className="kl">Equipos registrados</div><div className="kv s-ok">{kpi.equipos}</div><div className="ks">ventas de ejecutivos en el mes</div></div>
        <div className="card kpi"><div className="kl">Incentivos</div><div className="kv s-acc">{clp.format(kpi.gasto)}</div><div className="ks">{plural(kpi.incentivos, 'entrega', 'entregas')} en el mes</div></div>
        <div className="card kpi"><div className="kl">Pendientes abiertos</div><div className={'kv s-' + (pendientesTotal ? 'warn' : 'ok')}>{pendientesTotal}</div><div className="ks">en todas las tiendas</div></div>
      </section>

      <div className="bit">
        <ListaTiendas
          filas={visibles} total={tiendas.length} seleccionada={st.codigo} q={q} setQ={setQ} filtro={filtro} setFiltro={setFiltro}
          onElegir={(codigo) => { setSel(codigo); b.setAviso(null); }}
        />

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
              <div><span className="kl">Última visita</span><b>{accs[0] ? fechaCorta(accs[0].fecha) : '-'}</b></div>
              <div><span className="kl">Equipos | {mesCorto(mes)}</span><b>{equiposTienda}</b></div>
              <div><span className="kl">Incentivos | {mesCorto(mes)}</span><b>{clp.format(gastoTienda)}</b></div>
              <div><span className="kl">Ejecutivos</span><b>{activos.length}</b></div>
              <div><span className="kl">Acciones</span><b>{accs.length}</b></div>
            </div>
          </section>

          <div className="bit-two">
            {usuario.puedeRegistrar ? (
              <FormularioAccion hoy={hoy} tienda={st.codigo} ejecutivos={activos} aviso={b.aviso} setAviso={b.setAviso} registrar={b.registrar} />
            ) : (
              <section className="card">
                <h2>Solo lectura</h2>
                <p className="hint" style={{ lineHeight: 1.5 }}>Tu usuario puede ver la bitácora pero no registrar acciones. Pídele al administrador que te asigne el rol de registro.</p>
              </section>
            )}
            <Pendientes acciones={accs} puedeMarcar={usuario.puedeRegistrar} persona={persona} ejecutivo={ejecutivo} onMarcar={b.marcar} />
          </div>

          <Ranking
            acciones={accs} ejecutivos={ejsTienda} mes={mes} puedeRegistrar={usuario.puedeRegistrar}
            onCambiarEstado={b.cambiarEstado} onAgregar={(nombre) => b.agregarEjecutivo(st.codigo, nombre)}
          />

          {/* key: al cambiar de tienda, el filtro por autor vuelve a "Todos". */}
          <HistorialAcciones
            key={st.codigo} acciones={accs} persona={persona} ejecutivo={ejecutivo}
            puedeBorrar={(a) => puedeBorrarAccion(usuario, a.creado_por)} onBorrar={b.borrar}
          />
        </div>
      </div>
    </>
  );
}
