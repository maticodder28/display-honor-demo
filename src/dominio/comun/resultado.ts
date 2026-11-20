// Las operaciones que pueden fallar devuelven esto en vez de lanzar errores.
// Así la pantalla siempre sabe qué pasó y el objeto viaja sin problema desde una server action.

export type CodigoFalla = 'sin_permiso' | 'invalido' | 'duplicado' | 'en_uso' | 'demo' | 'otro';

export interface Falla {
  codigo: CodigoFalla;
  mensaje: string;
}

export type Resultado<T = null> = { ok: true; valor: T } | { ok: false; falla: Falla };

export const exito = <T>(valor: T): Resultado<T> => ({ ok: true, valor });
export const vacio = (): Resultado<null> => ({ ok: true, valor: null });
export const fallo = <T = never>(codigo: CodigoFalla, mensaje: string): Resultado<T> => ({ ok: false, falla: { codigo, mensaje } });
