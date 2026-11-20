import { describe, expect, it } from 'vitest';
import {
  abreviar, columnasSemana, cumplimiento, leerPrioridad, lunesDe, nombreSemana, normalizarProducto, numeroPrioridad, precargar, resumenSemana,
  semanasParaLlenar, sumarDias, type FotoProducto, type FotoRespuesta,
} from './foto';

const respuesta = (r: Partial<FotoRespuesta>): FotoRespuesta => ({
  id: 1, semana: '2026-11-16', tienda_codigo: 'T1', pedidos: [], requeridos: [], exhibidos: [], mesas: [],
  comentario: '', actualizado_por: null, updated_at: '', ...r,
});

describe('fechas de la semana', () => {
  it('encuentra el lunes de cualquier dia', () => {
    expect(lunesDe('2026-11-19')).toBe('2026-11-16');
    expect(lunesDe('2026-11-22')).toBe('2026-11-16');
    expect(lunesDe('2026-11-16')).toBe('2026-11-16');
  });

  it('suma dias cruzando meses y años', () => {
    expect(sumarDias('2026-12-29', 6)).toBe('2027-01-04');
  });

  it('nombra la semana sin simbolos especiales', () => {
    expect(nombreSemana('2026-11-09')).toBe('9-15 nov');
    expect(nombreSemana('2026-12-28')).toBe('28 dic - 3 ene');
  });
});

describe('cumplimiento', () => {
  it('mide exigidos exhibidos sobre exigidos', () => {
    expect(cumplimiento(respuesta({ pedidos: [1, 2, 3, 4], requeridos: [1, 2], exhibidos: [1, 3, 4] }))).toBe(0.5);
  });

  it('usa todos los pedidos si la tienda no tiene cluster', () => {
    expect(cumplimiento(respuesta({ pedidos: [1, 2, 3, 4], exhibidos: [1, 2, 3] }))).toBe(0.75);
  });

  it('es nulo sin respuesta o sin productos', () => {
    expect(cumplimiento(undefined)).toBeNull();
    expect(cumplimiento(respuesta({}))).toBeNull();
  });
});

describe('productos y prioridades', () => {
  const productos: FotoProducto[] = [
    { id: 1, nombre: 'A', corto: 'A', tipo: 'Equipo', orden: 2, activo: true },
    { id: 2, nombre: 'B', corto: 'B', tipo: 'Equipo', orden: 1, activo: true },
    { id: 3, nombre: 'C', corto: 'C', tipo: 'Accesorio', orden: 3, activo: false },
  ];

  it('usa los productos pedidos en la semana, o los activos si no hay respuestas', () => {
    expect(columnasSemana(productos, []).map((p) => p.id)).toEqual([2, 1]);
    expect(columnasSemana(productos, [respuesta({ pedidos: [3, 1] })]).map((p) => p.id)).toEqual([1, 3]);
  });

  it('busca el numero de prioridad por cluster', () => {
    const prio = [{ producto_id: 1, cluster: 'A', numero: 4 }];
    expect(numeroPrioridad(prio, 1, 'A')).toBe(4);
    expect(numeroPrioridad(prio, 1, 'B')).toBeNull();
    expect(numeroPrioridad(prio, 1, null)).toBeNull();
  });
});

describe('reglas del formulario y del admin', () => {
  const prod = (id: number, activo = true) => ({ id, nombre: `P${id}`, corto: `P${id}`, tipo: 'Equipo' as const, orden: id, activo });
  const resp = (semana: string, exhibidos: number[]) => ({
    id: 1, semana, tienda_codigo: 'T1', pedidos: [1, 2, 3], requeridos: [1, 2], exhibidos, mesas: [], comentario: '', actualizado_por: null, updated_at: '',
  });

  it('precarga con la semana anterior, solo con los productos que se siguen pidiendo', () => {
    const f = precargar([resp('2026-11-09', [1, 3])], [prod(1), prod(2), prod(3, false)], 'T1', '2026-11-16');
    expect(f.origen).toBe('previa');
    expect(f.exhibidos).toEqual([1]);
    expect(precargar([], [prod(1)], 'T1', '2026-11-16').origen).toBe('nueva');
  });
  it('el promotor solo llena la semana actual y el equipo hasta 4 atrás', () => {
    expect(semanasParaLlenar('2026-11-16', true)).toEqual(['2026-11-16']);
    expect(semanasParaLlenar('2026-11-16', false)).toEqual(['2026-11-16', '2026-11-09', '2026-11-02', '2026-10-26']);
  });
  it('abrevia sin "Honor" y valida prioridades de 1 a 999', () => {
    expect(abreviar('Honor Magic 8 Pro', '')).toBe('Magic 8 Pro');
    expect(normalizarProducto({ nombre: ' x ', corto: '', tipo: 'Equipo' })).toMatch(/nombre/);
    expect(leerPrioridad('')).toEqual({ ok: true, numero: null });
    expect(leerPrioridad('12')).toEqual({ ok: true, numero: 12 });
    expect(leerPrioridad('1000').ok).toBe(false);
  });
  it('resume la semana: promedio, comparación y producto con menos presencia', () => {
    const tiendas = [{ codigo: 'T1', tienda: 'T1', ciudad: '', cobertura: '', codigo_b2b: null, codigo_corto: null, cluster: 'A', merchandiser: null }];
    const s = resumenSemana('2026-11-16', [prod(1), prod(2)], tiendas, [resp('2026-11-16', [1]), resp('2026-11-09', [1, 2])]);
    expect(s.promedio).toBe(0.5);
    expect(s.promedioAnterior).toBe(1);
    expect(s.peor?.p.id).toBe(2);
  });
});
