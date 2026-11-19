'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { ResultadoLectura } from '@/lib/excel';

// La libreria de Excel se carga solo al subir o descargar un archivo.
const excel = () => import('@/lib/excel');
import { compute, clave, TODAS } from '@/lib/compute';
import { fdate, pct } from '@/lib/format';
import { METRICAS_DATOS, METRICAS_PRINCIPALES, type DatosCarga } from '@/lib/types';
import type { CargaHistorial } from '@/lib/data';
import { Flecha } from './Iconos';

interface Props {
  zona: string;
  actual: DatosCarga | null;
  historial: CargaHistorial[];
  /** Todas las fechas de corte publicadas, para avisar antes de reemplazar una. */
  fechas: string[];
}

const hoyChile = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

export default function AdminPanel({ zona, actual, historial, fechas }: Props) {
  const router = useRouter();
  const [archivo, setArchivo] = useState<string | null>(null);
  const [lectura, setLectura] = useState<ResultadoLectura | null>(null);
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error' | 'trabajando'; texto: string } | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const [corte, setCorte] = useState('');

  const valido = lectura && !lectura.errores.length && lectura.datos;

  async function leer(file: File) {
    setArchivo(file.name);
    setEstado(null);
    try {
      const { fechaMaxima, leerExcel } = await excel();
      const l = leerExcel(await file.arrayBuffer());
      setLectura(l);
      const hoy = hoyChile();
      const f = l.datos ? fechaMaxima(l.datos) : null;
      setCorte(f && f <= hoy ? f : hoy);
    } catch {
      setLectura({ errores: ['No pude leer el archivo. Revisa que sea un Excel (.xlsx) y que no esté protegido con contraseña.'], avisos: [], cerradas: 0 });
    }
  }

  async function publicar() {
    if (!valido || !lectura?.datos || !archivo) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(corte) || corte > hoyChile()) {
      setEstado({ tipo: 'error', texto: 'Elige una fecha de corte válida (hoy o antes).' });
      return;
    }
    if (fechas.includes(corte) && !window.confirm(`Ya hay un corte con fecha ${fdate(corte)}. ¿Reemplazarlo por este Excel? El anterior se borra del historial.`)) return;
    setEstado({ tipo: 'trabajando', texto: 'Publicando...' });
    const { aPayload } = await excel();
    const supabase = createClient();
    const { error } = await supabase.rpc('publicar_carga', { p: aPayload(lectura.datos, zona, archivo, corte) });
    if (error) {
      setEstado({ tipo: 'error', texto: `No se pudo publicar: ${error.message}` });
      return;
    }
    setEstado({ tipo: 'ok', texto: `Publicado como corte del ${fdate(corte)}. Queda guardado en el Historial.` });
    setLectura(null);
    setArchivo(null);
    router.refresh();
  }

  async function descargar() {
    if (!actual) return;
    const { descargarXlsx, exportarExcel } = await excel();
    descargarXlsx(exportarExcel(actual), `Display_Honor_${zona}_${hoyChile()}.xlsx`);
  }

  const d = lectura?.datos;
  const activas = d ? d.tiendas.filter((t) => t.cobertura !== 'Cerrada') : [];
  const prev = valido && d ? compute(d) : null;

  return (
    <div className="adm">
      <section className="card">
        <div className="steps">
          <div className="step">
            <div className="sn">1</div>
            <div>
              <h2>Descarga el Excel actual</h2>
              <p>Parte desde los datos publicados, con las tiendas y marcas al día. Edita las cantidades en las hojas Exhibiciones, Muebles DC, Display Zone y Promotores.</p>
              <button className="abtn ghost" type="button" onClick={descargar} disabled={!actual}>Descargar Excel actual</button>
            </div>
          </div>
          <div className="step">
            <div className="sn">2</div>
            <div>
              <h2>Sube el Excel actualizado</h2>
              <p>
                Debe tener las hojas <b>Tiendas</b>, <b>Exhibiciones</b>, <b>Muebles DC</b>, <b>Display Zone</b> y <b>Promotores</b>. Deja vacía la fila de una
                tienda sin levantamiento; un 0 significa que la marca no tiene nada ahí. Para agregar una marca, inserta su columna
                antes de Total en las tres hojas.
              </p>
              <label
                className={'drop' + (arrastrando ? ' over' : '')}
                htmlFor="archivo"
                onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
                onDragLeave={() => setArrastrando(false)}
                onDrop={(e) => { e.preventDefault(); setArrastrando(false); const f = e.dataTransfer.files[0]; if (f) leer(f); }}
              >
                <input type="file" id="archivo" accept=".xlsx,.xls,.xlsm" onChange={(e) => { const f = e.target.files?.[0]; if (f) leer(f); e.target.value = ''; }} />
                <b>Arrastra el Excel aquí o haz clic para elegirlo</b>
                <span>{archivo ?? '.xlsx | se revisa antes de publicar'}</span>
              </label>
            </div>
          </div>
          {lectura && (
            <div className="step">
              <div className="sn">3</div>
              <div>
                <h2>Revisa y publica</h2>
                {d && (
                  <div className="sum">
                    <div><b>{activas.length}</b><span>tiendas activas</span></div>
                    {METRICAS_DATOS.map(([m, l]) => (
                      <div key={m}><b>{Object.keys(d.metricas[m]).filter((c) => activas.some((t) => t.codigo === c)).length}/{activas.length}</b><span>{l} con dato</span></div>
                    ))}
                    <div><b>{d.marcas.length}</b><span>marcas</span></div>
                  </div>
                )}
                <div className="msgs">
                  {prev && (
                    <div className="msg o">
                      Archivo válido. Share Honor resultante:{' '}
                      {METRICAS_PRINCIPALES.map(([m, l]) => `${l} ${pct(prev.byKey.get(clave(TODAS, TODAS, TODAS, m) + '|Honor')?.share)}`).join(' | ')}.
                      {lectura.cerradas ? ` ${lectura.cerradas} tienda(s) cerrada(s) quedan fuera.` : ''}
                    </div>
                  )}
                  {lectura.errores.map((m) => <div key={m} className="msg e">{m}</div>)}
                  {lectura.avisos.map((m) => <div key={m} className="msg w">{m}</div>)}
                </div>
                {valido && (
                  <label className="corte">
                    <span>Fecha de corte</span>
                    <input type="date" value={corte} max={hoyChile()} onChange={(e) => setCorte(e.target.value)} required />
                    <small>
                      {fechas.includes(corte)
                        ? `Ya existe un corte con esta fecha: se reemplazará.`
                        : 'Propuesta: la fecha de levantamiento más reciente del Excel. Con ella se guarda en el Historial.'}
                    </small>
                  </label>
                )}
                <div className="row">
                  <button className="abtn" type="button" onClick={publicar} disabled={!valido || estado?.tipo === 'trabajando'}>Publicar datos</button>
                  <button className="ibtn" type="button" onClick={() => { setLectura(null); setArchivo(null); }}>Descartar</button>
                </div>
              </div>
            </div>
          )}
          {estado && <p className={'hint ' + (estado.tipo === 'ok' ? 's-ok' : estado.tipo === 'error' ? 's-bad' : '')}>{estado.texto}</p>}
        </div>
      </section>
      <section className="card">
        <div className="ch"><h2>Cortes publicados</h2><a className="hint" href="/historial">Ver Historial <Flecha /></a></div>
        {historial.length ? (
          historial.map((h) => (
            <div className="hi" key={h.id}>
              <b>Corte {fdate(h.fecha_corte)}</b>
              <span>{h.archivo ?? 'Excel'} | {h.por_nombre ?? 'Carga inicial'} | subido {new Date(h.created_at).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              <span>{[...METRICAS_DATOS, ['muebles', 'Muebles'] as const].map(([m, l]) => (h.resumen[m] ? `${l} ${h.resumen[m]}` : null)).filter(Boolean).join(' | ')}</span>
            </div>
          ))
        ) : (
          <div className="empty">Sin cargas todavía.</div>
        )}
      </section>
    </div>
  );
}
