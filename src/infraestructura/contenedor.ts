import 'server-only';
import { crearAcceso } from '@/aplicacion/casos-de-uso/acceso';
import { crearCasosAsistente } from '@/aplicacion/casos-de-uso/asistente';
import { crearCasosBitacora } from '@/aplicacion/casos-de-uso/bitacora';
import { crearCasosDisplay } from '@/aplicacion/casos-de-uso/display';
import { crearCasosFoto } from '@/aplicacion/casos-de-uso/foto';
import { crearCasosSesion } from '@/aplicacion/casos-de-uso/sesion';
import { DEMO, ZONA } from '@/config';
import { MODELO_POR_DEFECTO } from '@/dominio/asistente/agente';
import { hoyEnChile } from '@/dominio/comun/fechas';
import { repositorioBitacoraDemo, repositorioDisplayDemo, repositorioFotoDemo, sesionDemo } from './demo/repositorios';
import { crearModeloGroq } from './groq/modelo';
import { repositorioBitacoraSupabase } from './supabase/repositorios/bitacora';
import { repositorioDisplaySupabase } from './supabase/repositorios/display';
import { repositorioFotoSupabase } from './supabase/repositorios/foto';
import { crearClienteServidor, type ClienteSupabase } from './supabase/servidor';
import { sesionSupabase } from './supabase/sesion';

/**
 * Raíz de composición: el único lugar que sabe qué implementación usa cada caso de uso.
 * Con NEXT_PUBLIC_DEMO=1 todo sale de los repositorios demo; si no, de Supabase.
 * Se arma uno por request, porque el cliente de Supabase lleva las cookies de ese usuario.
 */
export function contenedor() {
  let cliente: Promise<ClienteSupabase> | null = null;
  const db = () => (cliente ??= crearClienteServidor());

  const sesion = DEMO ? sesionDemo : sesionSupabase(db);
  const display = DEMO ? repositorioDisplayDemo : repositorioDisplaySupabase(db, ZONA);
  const bitacora = DEMO ? repositorioBitacoraDemo : repositorioBitacoraSupabase(db, ZONA);
  const foto = DEMO ? repositorioFotoDemo : repositorioFotoSupabase(db, ZONA);
  const nombreModelo = process.env.GROQ_MODEL || MODELO_POR_DEFECTO;
  const deps = { sesion, hoy: () => hoyEnChile() };

  return {
    cargarVista: crearAcceso(sesion),
    sesion: crearCasosSesion(sesion),
    display: crearCasosDisplay({ ...deps, repo: display }),
    bitacora: crearCasosBitacora({ ...deps, repo: bitacora }),
    foto: crearCasosFoto({ ...deps, repo: foto }),
    asistente: crearCasosAsistente({
      repo: display, sesion, nombreModelo,
      llm: crearModeloGroq({ apiKey: process.env.GROQ_API_KEY, modelo: nombreModelo }),
    }),
  };
}
