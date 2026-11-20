// Quién es el usuario y qué puede hacer. Los permisos reales los aplica la base (RLS);
// estas reglas son la misma lógica del lado de la app, para no ofrecer botones que van a fallar.

export type Rol = 'admin' | 'registro' | 'viewer' | 'promotor';

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  cargo: string | null;
  rol: Rol;
  esAdmin: boolean;
  puedeRegistrar: boolean;
  /** El promotor solo entra a la Foto del Éxito de su tienda. */
  esPromotor: boolean;
  tiendaCodigo: string | null;
}

/** Nombre y cargo de cada persona del equipo, para mostrar quién registró qué. */
export interface Perfil { id: string; nombre: string | null; cargo: string | null }

export type Vista = 'dashboard' | 'historial' | 'bitacora' | 'foto' | 'admin' | 'asistente';

const ROLES: Rol[] = ['admin', 'registro', 'viewer', 'promotor'];

/** Arma el usuario a partir del perfil guardado. Si falta el rol, queda en solo lectura. */
export function crearUsuario(p: { id: string; email?: string | null; nombre?: string | null; cargo?: string | null; rol?: string | null; tiendaCodigo?: string | null }): Usuario {
  const rol: Rol = ROLES.includes(p.rol as Rol) ? (p.rol as Rol) : 'viewer';
  const email = p.email ?? '';
  return {
    id: p.id,
    email,
    nombre: p.nombre || email.split('@')[0] || 'Usuario',
    cargo: p.cargo ?? null,
    rol,
    esAdmin: rol === 'admin',
    puedeRegistrar: rol === 'admin' || rol === 'registro',
    esPromotor: rol === 'promotor',
    tiendaCodigo: p.tiendaCodigo ?? null,
  };
}

/** El promotor solo ve la Foto del Éxito; el resto ve todo (Admin muestra un aviso si no es admin). */
export const puedeVer = (u: Usuario, vista: Vista) => !u.esPromotor || vista === 'foto';

/** Llenar la Foto: el equipo con rol de registro cualquier tienda, el promotor solo la suya. */
export const puedeLlenarFoto = (u: Usuario, tienda: string) => u.puedeRegistrar || (u.esPromotor && u.tiendaCodigo === tienda);

/** Borrar un registro de la bitácora: quien lo creó o un admin. */
export const puedeBorrarAccion = (u: Usuario, creadoPor: string) => u.puedeRegistrar && (creadoPor === u.id || u.esAdmin);

/**
 * Después del login solo dejo volver a rutas de esta misma web.
 * Rechaza "//otro.com", "/\otro.com" y URLs completas, que servirían para mandar a alguien a otro sitio.
 */
export function destinoSeguro(next: string): string {
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/';
  try {
    const u = new URL(next, 'http://local');
    const ruta = u.pathname + u.search + u.hash;
    return u.origin === 'http://local' && !ruta.startsWith('//') ? ruta : '/';
  } catch {
    return '/';
  }
}
