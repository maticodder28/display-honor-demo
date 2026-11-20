'use server';
import type { NuevaAccion } from '@/dominio/bitacora/bitacora';
import { contenedor } from '@/infraestructura/contenedor';

export async function registrarAccion(a: NuevaAccion) {
  return contenedor().bitacora.registrar(a);
}

export async function agregarEjecutivo(tienda: string, nombre: string) {
  return contenedor().bitacora.agregarEjecutivo(tienda, nombre);
}

export async function cambiarEstadoEjecutivo(id: number, activo: boolean) {
  return contenedor().bitacora.cambiarEstadoEjecutivo(id, activo);
}

export async function marcarPendiente(id: number, hecho: boolean) {
  return contenedor().bitacora.marcarPendiente(id, hecho);
}

export async function eliminarAccion(id: number) {
  return contenedor().bitacora.eliminar(id);
}
