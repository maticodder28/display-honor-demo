'use client';
import { useState } from 'react';
import {
  MAX_MESAS, acotarMesa, fechaCorta, nombreSemana, numeroPrioridad, precargar, semanasParaLlenar, sumar,
  type FotoPrioridad, type FotoProducto, type FotoRespuesta, type FotoTienda,
} from '@/dominio/foto/foto';
import type { Usuario } from '@/dominio/usuario';
import { guardarFoto } from '@/presentacion/acciones/foto';
import type { Estado } from './formato';

interface Props {
  usuario: Usuario; semanaActual: string; productos: FotoProducto[]; prioDe: (s: string) => FotoPrioridad[]; tiendas: FotoTienda[];
  respuestas: FotoRespuesta[]; nombre: Map<string, string>;
  onGuardada: (r: FotoRespuesta) => void;
}

/** Formulario semanal. El promotor llena su tienda y la semana actual; el equipo de zona, cualquier tienda y hasta 4 semanas atrás. */
export default function Formulario({ usuario, semanaActual, productos, prioDe, tiendas, respuestas, nombre, onGuardada }: Props) {
  const misTiendas = usuario.esPromotor ? tiendas.filter((t) => t.codigo === usuario.tiendaCodigo) : tiendas;
  const semanas = semanasParaLlenar(semanaActual, usuario.esPromotor);
  const [tienda, setTienda] = useState(misTiendas[0]?.codigo ?? '');
  const [semana, setSemana] = useState(semanaActual);
  const [form, setForm] = useState(() => precargar(respuestas, productos, tienda, semana));
  const [estado, setEstado] = useState<Estado>(null);
  const [guardando, setGuardando] = useState(false);

  const elegir = (cod: string, sem: string) => { setTienda(cod); setSemana(sem); setForm(precargar(respuestas, productos, cod, sem)); setEstado(null); };
  const lista = productos.filter((p) => form.pedidos.includes(p.id)).sort((a, b) => a.orden - b.orden);
  const alternar = (id: number) => setForm((f) => ({ ...f, exhibidos: f.exhibidos.includes(id) ? f.exhibidos.filter((x) => x !== id) : [...f.exhibidos, id] }));
  const setMesa = (i: number, v: string) => setForm((f) => { const m = f.mesas.slice(); m[i] = acotarMesa(parseInt(v, 10)); return { ...f, mesas: m }; });
  const t = tiendas.find((x) => x.codigo === tienda);
  const prioridades = prioDe(semana);

  async function enviar() {
    setGuardando(true);
    const comentario = form.comentario.trim();
    const r = await guardarFoto({ tienda, semana, exhibidos: form.exhibidos, mesas: form.mesas, comentario });
    setGuardando(false);
    if (!r.ok) { setEstado({ ok: false, texto: r.falla.mensaje }); return; }
    // La base ya calculó pedidos y exigidos; acá armo la misma respuesta para mostrarla sin recargar.
    const guardada: FotoRespuesta = {
      id: form.r && form.origen === 'enviada' ? form.r.id : -Date.now(), semana, tienda_codigo: tienda, pedidos: form.pedidos,
      requeridos: form.origen === 'enviada' && form.r ? form.r.requeridos
        : form.pedidos.filter((id) => numeroPrioridad(prioridades, id, t?.cluster ?? null) != null),
      exhibidos: form.exhibidos.filter((id) => form.pedidos.includes(id)), mesas: form.mesas, comentario,
      actualizado_por: usuario.id, updated_at: new Date().toISOString(),
    };
    onGuardada(guardada);
    setForm({ origen: 'enviada', r: guardada, pedidos: guardada.pedidos, exhibidos: guardada.exhibidos, mesas: guardada.mesas, comentario });
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
                {semanas.map((s) => <option key={s} value={s}>{nombreSemana(s)}{s === semanaActual ? ' (actual)' : ''}</option>)}
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
                  <button key={p.id} type="button" className={'foto-tg' + (on ? ' on' : '')} aria-pressed={on} onClick={() => alternar(p.id)}>
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
              <button type="button" className="ibtn" aria-label="Agregar una mesa" onClick={() => setForm((f) => ({ ...f, mesas: [...f.mesas, 0] }))} disabled={form.mesas.length >= MAX_MESAS}>+</button>
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
