'use client';
import { useState, type CSSProperties } from 'react';
import type { BitAccion } from '@/dominio/bitacora/bitacora';
import { TIPO, clp, fechaCorta, plural, type Persona } from './formato';

interface Props {
  acciones: BitAccion[];
  persona: (id: string) => Persona;
  ejecutivo: (id: number) => string | undefined;
  puedeBorrar: (a: BitAccion) => boolean;
  onBorrar: (a: BitAccion) => void;
}

export default function HistorialAcciones({ acciones, persona, ejecutivo, puedeBorrar, onBorrar }: Props) {
  const [autor, setAutor] = useState('todos');
  const autores = [...new Set(acciones.map((a) => a.creado_por))];
  const lista = acciones.filter((a) => autor === 'todos' || a.creado_por === autor);

  return (
    <section className="card">
      <div className="ch">
        <div><h2>Historial</h2><span className="hint">{acciones.length ? `${lista.length} de ${acciones.length} registros, del más reciente al más antiguo` : 'Sin registros todavía'}</span></div>
        {autores.length > 1 && (
          <div className="pills" role="group" aria-label="Registrado por">
            <button type="button" aria-pressed={autor === 'todos'} onClick={() => setAutor('todos')}>Todos</button>
            {autores.map((id) => (
              <button key={id} type="button" aria-pressed={autor === id} onClick={() => setAutor(id)}>{persona(id).nombre}</button>
            ))}
          </div>
        )}
      </div>
      {lista.map((a) => {
        const p = persona(a.creado_por), t = TIPO[a.tipo];
        const dato = a.tipo === 'venta' ? plural(a.unidades ?? 0, 'equipo', 'equipos') : a.tipo === 'incentivo' ? clp.format(a.costo ?? 0) : '';
        return (
          <div key={a.id} className="bit-h">
            <div className="hint bit-h-f">{fechaCorta(a.fecha)}</div>
            <i style={{ background: t?.color }} />
            <div>
              <div className="bit-h-m">
                <b style={{ '--c': t?.color } as CSSProperties}>{t?.label ?? a.tipo}</b>
                {a.ejecutivo_id && <span className="hint">| {ejecutivo(a.ejecutivo_id) ?? 'ejecutivo'}</span>}
                {dato && <b>{dato}</b>}
                {a.pendiente && !a.hecho && <span className="badge b-warn">Pendiente</span>}
              </div>
              {a.detalle && <div className="bit-h-d">{a.detalle}</div>}
              <div className="hint bit-h-a">
                <span className="bit-av" style={{ background: p.color }}>{p.ini}</span>
                Registrado por {p.nombre}{p.cargo ? ` | ${p.cargo}` : ''}
                {puedeBorrar(a) && <button type="button" className="bit-del" onClick={() => onBorrar(a)}>Eliminar</button>}
              </div>
            </div>
          </div>
        );
      })}
      {acciones.length > 0 && !lista.length && <div className="empty">No hay registros con este filtro.</div>}
    </section>
  );
}
