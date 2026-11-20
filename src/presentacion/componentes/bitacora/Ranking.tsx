'use client';
import { useState } from 'react';
import { puesto, rankingEjecutivos, type BitAccion, type BitEjecutivo } from '@/dominio/bitacora/bitacora';
import { NIVEL_CLASE, clp, fechaCorta, nombreMes, plural } from './formato';

interface Props {
  acciones: BitAccion[];
  /** Todos los ejecutivos de la tienda, activos y de baja. */
  ejecutivos: BitEjecutivo[];
  mes: string;
  puedeRegistrar: boolean;
  onCambiarEstado: (e: BitEjecutivo, activo: boolean) => void;
  onAgregar: (nombre: string) => Promise<boolean>;
}

export default function Ranking({ acciones, ejecutivos, mes, puedeRegistrar, onCambiarEstado, onAgregar }: Props) {
  const [nuevo, setNuevo] = useState('');
  const { filas, total } = rankingEjecutivos(acciones, ejecutivos, mes);
  const deBaja = ejecutivos.filter((e) => !e.activo);

  async function agregar() {
    if (nuevo.trim().length < 2) return;
    if (await onAgregar(nuevo)) setNuevo('');
  }

  return (
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
            {filas.map((r, i) => (
              <tr key={r.e.id}>
                <td className="l st s-mut">{puesto(filas, i)}</td>
                <td className="l">
                  <b>{r.e.nombre}</b>{!r.e.activo && <span className="badge b-mut bit-baja">De baja</span>}
                  <div className="hint">
                    {r.registros ? plural(r.registros, 'registro de venta', 'registros de venta') : 'Sin ventas en el mes'}
                    {puedeRegistrar && r.e.activo && <> | <button type="button" className="bit-del bit-inline" onClick={() => onCambiarEstado(r.e, false)}>Dar de baja</button></>}
                  </div>
                </td>
                <td className="st">{r.u}</td>
                <td className="l">
                  <div className="bit-bar"><div className="track"><div className={'fill b-' + NIVEL_CLASE[r.nivel]} style={{ width: `${Math.round(r.share * 100)}%` }} /></div><span>{total ? `${Math.round(r.share * 100)}%` : '-'}</span></div>
                </td>
                <td className="l"><span className={'badge b-' + NIVEL_CLASE[r.nivel]}>{r.nivel}</span></td>
                <td>{r.incs.length ? clp.format(r.costo) : '-'}{r.incs.length > 0 && <div className="hint">{plural(r.incs.length, 'entrega', 'entregas')} | último {fechaCorta(r.incs[0].fecha)}</div>}</td>
              </tr>
            ))}
            {!filas.length && <tr><td className="l empty" colSpan={6}>Sin ejecutivos registrados en esta tienda.</td></tr>}
          </tbody>
        </table>
      </div>
      {deBaja.length > 0 && (
        <details className="bit-bajas">
          <summary>{plural(deBaja.length, 'ejecutivo dado de baja', 'ejecutivos dados de baja')} en esta tienda</summary>
          <ul>
            {deBaja.map((e) => (
              <li key={e.id}>
                <span>{e.nombre}</span>
                {puedeRegistrar && <button type="button" className="ibtn" onClick={() => onCambiarEstado(e, true)}>Reactivar</button>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {puedeRegistrar && (
        <div className="row" style={{ marginTop: 12, alignItems: 'flex-end' }}>
          <label className="bit-lbl" style={{ flex: '1 1 220px' }}>Agregar ejecutivo a esta tienda
            <input type="text" placeholder="Nombre y apellido" maxLength={80} value={nuevo} onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') agregar(); }} />
          </label>
          <button type="button" className="abtn ghost" onClick={agregar} disabled={nuevo.trim().length < 2}>Agregar</button>
        </div>
      )}
    </section>
  );
}
