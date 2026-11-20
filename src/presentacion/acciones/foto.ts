'use server';
import type { DatosProducto, EnvioFoto } from '@/dominio/foto/foto';
import { contenedor } from '@/infraestructura/contenedor';

export async function guardarFoto(e: EnvioFoto) {
  return contenedor().foto.guardar(e);
}

export async function crearProducto(p: DatosProducto, orden: number) {
  return contenedor().foto.crearProducto(p, orden);
}

export async function editarProducto(id: number, p: DatosProducto) {
  return contenedor().foto.editarProducto(id, p);
}

export async function activarProducto(id: number, activo: boolean) {
  return contenedor().foto.activarProducto(id, activo);
}

export async function eliminarProducto(id: number) {
  return contenedor().foto.eliminarProducto(id);
}

export async function fijarPrioridad(productoId: number, cluster: string, numero: number | null) {
  return contenedor().foto.fijarPrioridad(productoId, cluster, numero);
}
