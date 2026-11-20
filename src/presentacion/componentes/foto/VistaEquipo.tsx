'use client';
import { useState } from 'react';
import {
  cumplimiento, fechaCorta, nombreSemana, numeroPrioridad, resumenSemana, sumar,
  type FotoPrioridad, type FotoProducto, type FotoRespuesta, type FotoTienda,
} from '@/dominio/foto/foto';
import { Check } from '@/presentacion/componentes/comun/Iconos';
import { claseCumplimiento, claseDelta, coberturaCorta, nombreSinCadena, pct, pp } from './formato';

interface Props {
  semana: string; setSemana: (s: string) => void; semanas: string[]; semanaActual: string;
  productos: FotoProducto[]; prioridades: FotoPrioridad[]; tiendas: FotoTienda[]; respuestas: FotoRespuesta[]; nombre: Map<string, string>;
}

/** Lo que ve el equipo de zona: indicadores de la semana, la matriz tienda x producto y la descarga en Excel. */
export default function VistaEquipo({ semana, setSemana, semanas, semanaActual, productos, prioridades, tiendas, respuestas, nombre }: Props) {
  const [bajando, setBajando] = useState(false);
  const s = resumenSemana(semana, productos, tiendas, respuestas);

  async function descargar() {
    setBajando(true);
    try {
      const [{ excelFotoSemana }, { descargarXlsx }] = await Promise.all([
        import('@/infraestructura/excel/fotoSemana'), import('@/infraestructura/excel/levantamiento'),
      ]);
      descargarXlsx(await excelFotoSemana(semana, s.columnas, tiendas, s.deSemana, prioridades), `Foto_del_Exito_ENTEL_${semana}.xlsx`);
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
            {semanas.slice(0, 8).map((x) => (
              <button key={x} type="button" aria-pressed={semana === x} onClick={() => setSemana(x)}>
                {nombreSemana(x)}{x === semanaActual ? ' (actual)' : ''}
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
          <div className="kv">{s.respondieron.length} de {tiendas.length}</div>
          <div className={'ks ' + (s.faltan.length ? 's-warn' : 's-ok')}>
            {s.faltan.length ? `Faltan: ${s.faltan.map((t) => nombreSinCadena(t.tienda)).join(', ')}` : 'Todas respondieron'}
          </div>
        </div>
        <div className="card kpi">
          <div className="kl">Cumplimiento promedio</div>
          <div className="kv s-acc">{pct(s.promedio)}</div>
          <div className={'ks ' + (s.promedio != null && s.promedioAnterior != null ? claseDelta(s.promedio - s.promedioAnterior) : 's-mut')}>
            {s.promedio != null && s.promedioAnterior != null ? `${pp(s.promedio - s.promedioAnterior)} vs semana anterior` : 'Sin semana anterior para comparar'}
          </div>
        </div>
        <div className="card kpi">
          <div className="kl">Exigido con menos presencia</div>
          <div className="kv" style={{ fontSize: 22 }}>{s.peor ? s.peor.p.nombre : '-'}</div>
          <div className="ks">{s.peor ? `Exhibido en ${pct(s.peor.x)} de las tiendas que lo tienen exigido` : 'Sin respuestas esta semana'}</div>
        </div>
        <div className="card kpi">
          <div className="kl">Equipos en mesas genéricas</div>
          <div className="kv">{s.equiposEnMesas}</div>
          <div className="ks">{s.mesas} {s.mesas === 1 ? 'mesa' : 'mesas'} en {s.respondieron.length} {s.respondieron.length === 1 ? 'tienda' : 'tiendas'}</div>
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
                {s.columnas.map((p) => <th key={p.id} title={p.nombre}>{p.corto}</th>)}
                <th>Cumplim.</th><th>Mesas genéricas</th><th>Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {tiendas.map((t) => {
                const r = s.porTienda.get(t.codigo);
                const c = cumplimiento(r), ca = cumplimiento(s.anterior.get(t.codigo));
                const ex = new Set(r?.exhibidos ?? []), ped = new Set(r?.pedidos ?? []), req = new Set(r?.requeridos ?? []);
                return (
                  <tr key={t.codigo} className={r ? undefined : 'pend'}>
                    <td className="t">
                      <b>{t.tienda}</b>
                      <small>{t.ciudad} | Cluster {t.cluster ?? '-'} | {coberturaCorta(t.cobertura)} | {t.cobertura === 'Promotor' ? 'promotor + equipo de zona' : 'equipo de zona'}</small>
                      {r?.comentario && <small className="foto-com">{r.comentario}</small>}
                    </td>
                    {s.columnas.map((p) => {
                      const si = !!r && ex.has(p.id), exigido = req.has(p.id);
                      const n = numeroPrioridad(prioridades, p.id, t.cluster);
                      const titulo = `${p.nombre}: ${!r ? 'sin respuesta' : si ? 'exhibido' : 'no exhibido'}${exigido ? ` | exigido (Nro. ${n ?? '-'})` : ' | no exigido para su cluster'}`;
                      // Celda vacía si la tienda no respondió o si ese producto no se pedía cuando respondió.
                      return (
                        <td key={p.id} title={titulo}
                          className={!r ? '' : !ped.has(p.id) ? 's-mut' : si ? (exigido ? 'foto-si' : 'foto-extra') : exigido ? 'foto-falta' : 'foto-na'}>
                          {!r ? '' : !ped.has(p.id) ? '' : si ? <Check titulo="exhibido" /> : exigido ? 'X' : <span className="foto-punto" />}
                        </td>
                      );
                    })}
                    <td>
                      <span className={'b ' + claseCumplimiento(c)}>{pct(c)}</span>
                      {c != null && ca != null && <small className={'foto-d ' + claseDelta(c - ca)}>{pp(c - ca)}</small>}
                    </td>
                    <td className="s-mut">{!r ? '-' : r.mesas.length ? `${r.mesas.length} | ${sumar(r.mesas)} eq.` : 'Sin mesas'}</td>
                    <td>
                      {r ? <><span>{fechaCorta(r.updated_at)}</span><small className="foto-d s-mut">{nombre.get(r.actualizado_por ?? '') ?? ''}</small></> : <span className="s-bad b">Pendiente</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {s.respondieron.length > 0 && (
              <tfoot>
                <tr>
                  <td className="b">% de tiendas</td>
                  {s.presencia.map(({ p, x }) => <td key={p.id} className={'b ' + claseCumplimiento(x)}>{pct(x)}</td>)}
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
