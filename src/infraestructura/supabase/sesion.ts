import type { ServicioSesion } from '@/aplicacion/puertos';
import { fallo, vacio } from '@/dominio/comun/resultado';
import { crearUsuario, type Usuario } from '@/dominio/usuario';
import type { ClienteSupabase } from './servidor';

export function sesionSupabase(db: () => Promise<ClienteSupabase>): ServicioSesion {
  // Una página puede preguntar varias veces por el usuario en el mismo request: lo pido una sola vez.
  let usuario: Promise<Usuario | null> | null = null;

  async function leerUsuario(): Promise<Usuario | null> {
    const cliente = await db();
    const { data: { user } } = await cliente.auth.getUser();
    if (!user) return null;
    const { data: perfil } = await cliente.from('perfiles').select('nombre, rol, cargo, tienda_codigo').eq('id', user.id).maybeSingle();
    return crearUsuario({
      id: user.id, email: user.email, nombre: perfil?.nombre, cargo: perfil?.cargo, rol: perfil?.rol, tiendaCodigo: perfil?.tienda_codigo,
    });
  }

  return {
    usuarioActual: () => (usuario ??= leerUsuario()),

    async iniciar(email, password) {
      const { error } = await (await db()).auth.signInWithPassword({ email, password });
      if (!error) return vacio();
      return fallo(error.message.includes('Invalid login') ? 'invalido' : 'otro', error.message);
    },

    async cerrar() {
      await (await db()).auth.signOut();
    },
  };
}
