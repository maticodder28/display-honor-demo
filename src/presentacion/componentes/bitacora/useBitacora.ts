'use client';
import { useState } from 'react';
import { buscarDadoDeBaja, type BitAccion, type BitEjecutivo, type NuevaAccion } from '@/dominio/bitacora/bitacora';
import {
  agregarEjecutivo as agregarEjecutivoAccion, cambiarEstadoEjecutivo, eliminarAccion, marcarPendiente, registrarAccion,
} from '@/presentacion/acciones/bitacora';
import type { Aviso } from './formato';

/**
 * Estado de la bitácora en el navegador y las escrituras. Cada escritura va al servidor (server action)
 * y, si sale bien, actualizo la lista local sin recargar la página.
 */
export function useBitacora(inicial: { acciones: BitAccion[]; ejecutivos: BitEjecutivo[] }) {
  const [acciones, setAcciones] = useState(inicial.acciones);
  const [ejecutivos, setEjecutivos] = useState(inicial.ejecutivos);
  const [aviso, setAviso] = useState<Aviso>(null);
  const error = (texto: string) => setAviso({ ok: false, texto });

  async function registrar(a: NuevaAccion): Promise<boolean> {
    const r = await registrarAccion(a);
    if (!r.ok) { error(r.falla.mensaje); return false; }
    setAcciones((l) => [r.valor, ...l]);
    setAviso({ ok: true, texto: 'Guardado en el historial.' });
    return true;
  }

  async function cambiarEstado(e: BitEjecutivo, activo: boolean): Promise<boolean> {
    if (!activo && !window.confirm(`¿Dar de baja a ${e.nombre}? Deja de aparecer para nuevos registros. Sus ventas e incentivos ya registrados se conservan en el historial y los reportes.`)) return false;
    const r = await cambiarEstadoEjecutivo(e.id, activo);
    if (!r.ok) {
      error(r.falla.codigo === 'duplicado' ? `Ya hay un ejecutivo activo llamado ${e.nombre} en esta tienda.` : r.falla.mensaje);
      return false;
    }
    setEjecutivos((l) => l.map((x) => (x.id === e.id ? { ...x, activo } : x)));
    setAviso({ ok: true, texto: activo ? `${e.nombre} vuelve a estar activo.` : `${e.nombre} quedó dado de baja.` });
    return true;
  }

  /** Si la persona ya estuvo en la tienda y la dieron de baja, la reactivo en vez de crearla de nuevo. */
  async function agregarEjecutivo(tienda: string, nombre: string): Promise<boolean> {
    const antiguo = buscarDadoDeBaja(ejecutivos.filter((e) => e.tienda_codigo === tienda), nombre);
    if (antiguo) return cambiarEstado(antiguo, true);
    const r = await agregarEjecutivoAccion(tienda, nombre);
    if (!r.ok) {
      error(r.falla.codigo === 'duplicado' ? `${nombre.trim()} ya está registrado en esta tienda.` : r.falla.mensaje);
      return false;
    }
    setEjecutivos((l) => [...l, r.valor]);
    return true;
  }

  async function marcar(a: BitAccion) {
    const r = await marcarPendiente(a.id, !a.hecho);
    if (!r.ok) { error(r.falla.mensaje); return; }
    setAcciones((l) => l.map((x) => (x.id === a.id ? { ...x, hecho: !a.hecho } : x)));
  }

  async function borrar(a: BitAccion) {
    if (!window.confirm('¿Eliminar este registro del historial? No se puede deshacer.')) return;
    const r = await eliminarAccion(a.id);
    if (!r.ok) { error(r.falla.mensaje); return; }
    setAcciones((l) => l.filter((x) => x.id !== a.id));
  }

  return { acciones, ejecutivos, aviso, setAviso, registrar, cambiarEstado, agregarEjecutivo, marcar, borrar };
}
