import { describe, expect, it } from 'vitest';
import { columnasSemana, cumplimiento, lunesDe, nombreSemana, numeroPrioridad, sumarDias, type FotoProducto, type FotoRespuesta } from './foto';

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
