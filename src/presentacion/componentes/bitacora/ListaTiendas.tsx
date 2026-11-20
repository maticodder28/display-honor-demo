'use client';
import type { BitAccion, BitTienda, EstadoVisita } from '@/dominio/bitacora/bitacora';
import { plural } from './formato';

export type Filtro = 'todas' | 'sinvisita' | 'pendientes';
export interface FilaTienda { t: BitTienda; lista: BitAccion[]; est: EstadoVisita; pend: number }

interface Props {
  filas: FilaTienda[];
  total: number;
  seleccionada: string;
  q: string;
  setQ: (q: string) => void;
  filtro: Filtro;
  setFiltro: (f: Filtro) => void;
  onElegir: (codigo: string) => void;
}

const FILTROS: [Filtro, string][] = [['todas', 'Todas'], ['sinvisita', 'Sin visita reciente'], ['pendientes', 'Con pendientes']];

export default function ListaTiendas({ filas, total, seleccionada, q, setQ, filtro, setFiltro, onElegir }: Props) {
  return (
    <section className="card bit-lista" aria-label="Tiendas">
      <div className="bit-lista-h">
        <label className="fl" htmlFor="bit-q">Tiendas | {filas.length} de {total}</label>
        <input id="bit-q" type="search" placeholder="Buscar tienda, código o ciudad..." value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="pills">
          {FILTROS.map(([v, l]) => (
            <button key={v} type="button" aria-pressed={filtro === v} onClick={() => setFiltro(v)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="bit-lista-b">
        {filas.map((f) => (
          <button key={f.t.codigo} type="button" className={'bit-row' + (f.t.codigo === seleccionada ? ' on' : '')} onClick={() => onElegir(f.t.codigo)}>
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
        {!filas.length && <div className="empty" style={{ padding: 14 }}>No hay tiendas con ese filtro.</div>}
      </div>
    </section>
  );
}
