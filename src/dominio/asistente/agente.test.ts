import { describe, expect, it } from 'vitest';
import { historialDemo } from '@/infraestructura/demo/datos';
import { argumentosAEntidades, cifras, definirHerramientas, verificar } from './agente';

const datos = historialDemo();

describe('verificador de cifras', () => {
  it('normaliza porcentajes y puntos', () => {
    expect(cifras('pasó de 15.4 % a 16,1% (+0,7 pp)')).toEqual(['15,4%', '16,1%', '0,7pp']);
  });
  it('separa cifras verificadas de las que no aparecen en las consultas', () => {
    const v = verificar('Honor tiene 15,4% y Samsung 99,9%.', ['Honor tiene 15,4% del share']);
    expect(v).toEqual({ verificadas: 1, sinVerificar: ['99,9%'] });
  });
});

describe('herramientas del agente', () => {
  it('descarta argumentos que no existen en los datos y solo ofrece valores reales', () => {
    const { e } = argumentosAEntidades({ ciudad: 'Santiago', cliente: 'ENTEL', n: 500 }, datos);
    expect(e).toMatchObject({ ciudad: null, cliente: 'Entel', n: null });
    const props = definirHerramientas(datos)[0].function.parameters.properties as Record<string, { enum?: string[] }>;
    expect(props.ciudad.enum).toEqual([...new Set(datos.tiendas.map((t) => t.ciudad))].sort());
  });
});
