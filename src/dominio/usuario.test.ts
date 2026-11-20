import { describe, expect, it } from 'vitest';
import { crearUsuario, destinoSeguro, puedeBorrarAccion, puedeLlenarFoto, puedeVer } from './usuario';

describe('usuario', () => {
  it('saca los permisos del rol y usa solo lectura si el rol no existe', () => {
    expect(crearUsuario({ id: '1', rol: 'registro' })).toMatchObject({ puedeRegistrar: true, esAdmin: false });
    expect(crearUsuario({ id: '1', rol: 'otro', email: 'ana@x.cl' })).toMatchObject({ rol: 'viewer', nombre: 'ana', puedeRegistrar: false });
  });
  it('el promotor solo ve y llena su Foto del Éxito', () => {
    const p = crearUsuario({ id: '1', rol: 'promotor', tiendaCodigo: 'DM101' });
    expect(puedeVer(p, 'foto')).toBe(true);
    expect(puedeVer(p, 'dashboard')).toBe(false);
    expect(puedeLlenarFoto(p, 'DM101')).toBe(true);
    expect(puedeLlenarFoto(p, 'DM102')).toBe(false);
  });
  it('borra un registro quien lo creó o un admin', () => {
    expect(puedeBorrarAccion(crearUsuario({ id: 'a', rol: 'registro' }), 'a')).toBe(true);
    expect(puedeBorrarAccion(crearUsuario({ id: 'a', rol: 'registro' }), 'b')).toBe(false);
    expect(puedeBorrarAccion(crearUsuario({ id: 'a', rol: 'admin' }), 'b')).toBe(true);
  });
  it('después del login solo vuelve a rutas internas', () => {
    expect(destinoSeguro('/bitacora?x=1')).toBe('/bitacora?x=1');
    for (const malo of ['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)']) expect(destinoSeguro(malo)).toBe('/');
  });
});
