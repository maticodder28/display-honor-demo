'use client';
import type { BitAccion } from '@/dominio/bitacora/bitacora';
import { TIPO, fechaCorta, plural, type Persona } from './formato';

interface Props {
  acciones: BitAccion[];
  puedeMarcar: boolean;
  persona: (id: string) => Persona;
  ejecutivo: (id: number) => string | undefined;
  onMarcar: (a: BitAccion) => void;
}

/** Pendientes de la tienda: primero los abiertos, después los hechos (tachados). */
export default function Pendientes({ acciones, puedeMarcar, persona, ejecutivo, onMarcar }: Props) {
  const pendientes = acciones.filter((a) => a.pendiente).sort((a, b) => Number(a.hecho) - Number(b.hecho));
  const abiertos = pendientes.filter((a) => !a.hecho).length;
  return (
    <section className="card bit-pend">
      <div className="ch"><h2>Pendientes</h2><span className="hint">{plural(abiertos, 'abierto', 'abiertos')}</span></div>
      {pendientes.map((a) => (
        <div key={a.id} className={'bit-p' + (a.hecho ? ' hecho' : '')}>
          <button type="button" className={'bit-chk' + (a.hecho ? ' on' : '')} aria-pressed={a.hecho}
            aria-label={a.hecho ? 'Reabrir pendiente' : 'Marcar como hecho'} disabled={!puedeMarcar} onClick={() => onMarcar(a)}>
            {a.hecho && <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M3 8.5l3 3 7-7" /></svg>}
          </button>
          <div>
            <div className="bit-p-t">{a.detalle || TIPO[a.tipo]?.label}</div>
            <div className="hint">{TIPO[a.tipo]?.label} | {fechaCorta(a.fecha)} | {persona(a.creado_por).nombre}{a.ejecutivo_id ? ` | ${ejecutivo(a.ejecutivo_id) ?? ''}` : ''}{a.hecho ? ' | hecho' : ''}</div>
          </div>
        </div>
      ))}
      {!pendientes.length && <div className="empty">Sin pendientes en esta tienda.</div>}
    </section>
  );
}
