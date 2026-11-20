// Los casos de uso se prueban con repositorios falsos en memoria: no hay Supabase ni Next de por medio.
// Esto es lo que gana la app al depender de interfaces (puertos) y no de la base directo.
import { describe, expect, it } from 'vitest';
import type { RepositorioBitacora, RepositorioDisplay, RepositorioFoto, ServicioSesion } from '@/aplicacion/puertos';
import { exito, vacio } from '@/dominio/comun/resultado';
import { crearUsuario, type Rol } from '@/dominio/usuario';
import { crearAcceso } from './acceso';
import { crearCasosBitacora } from './bitacora';
import { crearCasosDisplay } from './display';
import { crearCasosFoto } from './foto';
import { crearCasosSesion } from './sesion';

const hoy = () => '2026-11-19';
const sesionCon = (rol: Rol | null, tiendaCodigo: string | null = null): ServicioSesion => ({
  usuarioActual: async () => (rol ? crearUsuario({ id: 'u1', rol, tiendaCodigo }) : null),
  iniciar: async (_e, p) => (p === 'bien' ? vacio() : { ok: false, falla: { codigo: 'invalido', mensaje: 'Invalid login' } }),
  cerrar: async () => {},
});

/** Repositorio que anota lo que se le pidió guardar. */
function bitacoraFalsa() {
  const guardadas: unknown[] = [];
  const repo: RepositorioBitacora = {
    datos: async () => ({ tiendas: [], ejecutivos: [], acciones: [], perfiles: [] }),
    registrar: async (a) => { guardadas.push(a); return exito({ ...a, id: 1, hecho: false, creado_por: 'u1', created_at: '' }); },
    agregarEjecutivo: async (tienda, nombre) => { guardadas.push(nombre); return exito({ id: 1, tienda_codigo: tienda, nombre, activo: true }); },
    cambiarEstadoEjecutivo: async () => vacio(),
    marcarPendiente: async () => vacio(),
    eliminar: async () => vacio(),
  };
  return { repo, guardadas };
}

const visita = { tienda_codigo: 'DM101', fecha: '2026-11-19', tipo: 'visita' as const, ejecutivo_id: null, detalle: '  revisé stock  ', unidades: null, costo: null, pendiente: false };

describe('casos de uso de la bitácora', () => {
  it('registra con el detalle limpio cuando el usuario puede registrar', async () => {
    const { repo, guardadas } = bitacoraFalsa();
    const r = await crearCasosBitacora({ repo, sesion: sesionCon('registro'), hoy }).registrar(visita);
    expect(r.ok).toBe(true);
    expect(guardadas).toEqual([{ ...visita, detalle: 'revisé stock' }]);
  });
  it('no llega al repositorio sin permiso o con datos inválidos', async () => {
    const { repo, guardadas } = bitacoraFalsa();
    const lectura = await crearCasosBitacora({ repo, sesion: sesionCon('viewer'), hoy }).registrar(visita);
    expect(!lectura.ok && lectura.falla.codigo).toBe('sin_permiso');
    const futura = await crearCasosBitacora({ repo, sesion: sesionCon('admin'), hoy }).registrar({ ...visita, fecha: '2026-12-01' });
    expect(!futura.ok && futura.falla.codigo).toBe('invalido');
    const corto = await crearCasosBitacora({ repo, sesion: sesionCon('admin'), hoy }).agregarEjecutivo('DM101', ' a ');
    expect(corto.ok).toBe(false);
    expect(guardadas).toEqual([]);
  });
});

describe('casos de uso de la Foto del Éxito', () => {
  const guardadas: unknown[] = [];
  const repo = { guardar: async (e: unknown) => { guardadas.push(e); return vacio(); } } as unknown as RepositorioFoto;
  const envio = { tienda: 'DM101', semana: '2026-11-16', exhibidos: [1], mesas: [5, 900], comentario: ' ok ' };

  it('el promotor guarda su tienda en la semana actual, con las mesas acotadas', async () => {
    const r = await crearCasosFoto({ repo, sesion: sesionCon('promotor', 'DM101'), hoy }).guardar(envio);
    expect(r.ok).toBe(true);
    expect(guardadas.at(-1)).toEqual({ ...envio, mesas: [5, 200], comentario: 'ok' });
  });
  it('el promotor no llena otra tienda ni semanas pasadas', async () => {
    const casos = crearCasosFoto({ repo, sesion: sesionCon('promotor', 'DM101'), hoy });
    expect((await casos.guardar({ ...envio, tienda: 'DM102' })).ok).toBe(false);
    expect((await casos.guardar({ ...envio, semana: '2026-11-09' })).ok).toBe(false);
  });
  it('solo el admin cambia productos y prioridades', async () => {
    const r = await crearCasosFoto({ repo, sesion: sesionCon('registro'), hoy }).fijarPrioridad(1, 'A', 3);
    expect(!r.ok && r.falla.codigo).toBe('sin_permiso');
  });
});

describe('publicar un corte', () => {
  const repo = { publicar: async () => vacio() } as unknown as RepositorioDisplay;
  const datos = { marcas: ['Honor'], tiendas: [{ codigo: 'DM101' }], metricas: {} } as never;
  it('pide admin y una fecha de corte que no sea futura', async () => {
    const casos = (rol: Rol) => crearCasosDisplay({ repo, sesion: sesionCon(rol), hoy });
    expect((await casos('registro').publicar({ datos, archivo: 'x.xlsx', fechaCorte: '2026-11-19' })).ok).toBe(false);
    expect((await casos('admin').publicar({ datos, archivo: 'x.xlsx', fechaCorte: '2026-11-20' })).ok).toBe(false);
    expect((await casos('admin').publicar({ datos, archivo: 'x.xlsx', fechaCorte: '2026-11-19' })).ok).toBe(true);
  });
});

describe('acceso y sesión', () => {
  it('sin sesión manda al login; el promotor va a la Foto', async () => {
    expect((await crearAcceso(sesionCon(null))('dashboard', async () => 1)).tipo).toBe('login');
    expect(await crearAcceso(sesionCon('promotor'))('dashboard', async () => 1)).toEqual({ tipo: 'redirigir', a: '/foto' });
    expect((await crearAcceso(sesionCon('viewer'))('dashboard', async () => 1)).tipo).toBe('ok');
  });
  it('si la carga falla sin sesión, igual redirige al login (no revienta)', async () => {
    const r = await crearAcceso(sesionCon(null))('dashboard', () => Promise.reject(new Error('RLS')));
    expect(r.tipo).toBe('login');
  });
  it('el login devuelve un destino seguro o el tipo de error', async () => {
    const s = crearCasosSesion(sesionCon(null));
    expect(await s.iniciar('a@b.cl', 'bien', '//evil.com')).toEqual({ ok: true, destino: '/' });
    expect(await s.iniciar('a@b.cl', 'mal', '/foto')).toEqual({ ok: false, error: 'credenciales', destino: '/foto' });
  });
});
