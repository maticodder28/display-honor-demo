'use client';
import { useState } from 'react';
import { confirmacionNecesaria, validarAccion, type BitEjecutivo, type NuevaAccion, type TipoAccion } from '@/dominio/bitacora/bitacora';
import { TIPO, TIPOS, clp, type Aviso } from './formato';

interface Props {
  hoy: string;
  tienda: string;
  /** Solo los activos: a un dado de baja no se le registran cosas nuevas. */
  ejecutivos: BitEjecutivo[];
  aviso: Aviso;
  setAviso: (a: Aviso) => void;
  registrar: (a: NuevaAccion) => Promise<boolean>;
}

const VACIO = { ejecutivo: '', detalle: '', unidades: '', costo: '', pendiente: false };

export default function FormularioAccion({ hoy, tienda, ejecutivos, aviso, setAviso, registrar }: Props) {
  const [form, setForm] = useState({ tipo: 'visita' as TipoAccion, fecha: hoy, ...VACIO });
  const [guardando, setGuardando] = useState(false);
  const set = (p: Partial<typeof form>) => { setForm((f) => ({ ...f, ...p })); setAviso(null); };
  // Si cambian de tienda o dan de baja al elegido, el ejecutivo deja de ser válido y queda vacío.
  const ejecutivo = ejecutivos.some((e) => String(e.id) === form.ejecutivo) ? form.ejecutivo : '';
  const tipo = TIPO[form.tipo];

  async function guardar() {
    const accion: NuevaAccion = {
      tienda_codigo: tienda,
      fecha: form.fecha,
      tipo: form.tipo,
      ejecutivo_id: ejecutivo ? Number(ejecutivo) : null,
      detalle: form.detalle.trim(),
      unidades: form.tipo === 'venta' ? parseInt(form.unidades, 10) || null : null,
      costo: form.tipo === 'incentivo' && form.costo.trim() !== '' ? parseInt(form.costo, 10) : null,
      pendiente: form.pendiente,
    };
    const error = validarAccion(accion, hoy);
    if (error) { setAviso({ ok: false, texto: error }); return; }
    const raro = confirmacionNecesaria(accion);
    if (raro?.tipo === 'unidades' && !window.confirm(`¿Confirmas ${raro.valor} equipos vendidos? Es una cantidad alta para un solo registro.`)) return;
    if (raro?.tipo === 'costo' && !window.confirm(`¿Confirmas un costo de ${clp.format(raro.valor)}? Es un monto alto para un incentivo.`)) return;
    setGuardando(true);
    const ok = await registrar(accion);
    setGuardando(false);
    if (ok) setForm((f) => ({ ...f, ...VACIO }));
  }

  return (
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
          <select value={ejecutivo} onChange={(e) => set({ ejecutivo: e.target.value })}>
            <option value="">{ejecutivos.length ? 'Sin ejecutivo' : 'Agrega ejecutivos abajo'}</option>
            {ejecutivos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
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
        <textarea rows={3} placeholder={tipo.placeholder} value={form.detalle} maxLength={2000} onChange={(e) => set({ detalle: e.target.value })} />
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
  );
}
