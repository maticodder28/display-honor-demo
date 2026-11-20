import { describe, expect, it } from 'vitest';
import { historialDemo, MARCAS_DEMO } from '@/infraestructura/demo/datos';
import { medir } from '@/dominio/display/historial';
import type { Modelo } from './clasificador';
import { extraer } from './entidades';
import { PREGUNTAS_EVALUACION } from './evaluacion';
import modelo from './modelo.json';
import { crearMotor } from './motor';
import { distancia, normalizar } from './texto';

const datos = historialDemo();
const catalogo = { tiendas: datos.tiendas, marcas: MARCAS_DEMO };
const responder = crearMotor(modelo as Modelo, datos);

describe('texto', () => {
  it('normaliza tildes, mayúsculas y signos', () => {
    expect(normalizar('¿Cómo está Copiapó?')).toBe('como esta copiapo');
  });
  it('mide la distancia de edición con corte temprano', () => {
    expect(distancia('ovalle', 'ovale')).toBe(1);
    expect(distancia('serena', 'serena')).toBe(0);
    expect(distancia('falabella', 'ripley', 2)).toBe(3);
  });
});

describe('entidades', () => {
  const conEntidades = PREGUNTAS_EVALUACION.filter((p) => p.entidades);

  it.each(conEntidades.map((p) => [p.pregunta, p.entidades!] as const))('"%s"', (pregunta, esperado) => {
    const { entidades: e } = extraer(pregunta, catalogo);
    if (esperado.ciudad) expect(e.ciudad).toBe(esperado.ciudad);
    if (esperado.cliente) expect(e.cliente).toBe(esperado.cliente);
    if (esperado.marca) expect(e.marca).toBe(esperado.marca);
    if (esperado.metrica) expect(e.metrica).toBe(esperado.metrica);
    if (esperado.tienda) expect(e.tienda?.codigo).toBe(esperado.tienda);
    if (esperado.direccion) expect(e.direccion).toBe(esperado.direccion);
    if (esperado.n) expect(e.n).toBe(esperado.n);
    if (esperado.cobertura) expect(e.cobertura).toBe(esperado.cobertura);
  });

  it('tolera errores de tipeo en ciudades y clientes', () => {
    const { entidades: e } = extraer('como vamos en ovale y en falabela', catalogo);
    expect(e.ciudad).toBe('Ovalle');
    expect(e.cliente).toBe('Falabella');
  });

  it('reconoce una tienda solo por el número de su código', () => {
    expect(extraer('como va la 105', catalogo).entidades.tienda?.codigo).toBe('DM105');
    expect(extraer('las 5 tiendas mas flojas', catalogo).entidades.tienda).toBeNull();
  });

  it('no confunde la métrica promotores con la cobertura Promotor', () => {
    expect(extraer('share de promotores', catalogo).entidades).toMatchObject({ metrica: 'promotores', cobertura: null });
    expect(extraer('share en tiendas con cobertura promotor', catalogo).entidades).toMatchObject({ cobertura: 'Promotor' });
  });
});

describe('motor', () => {
  it('acierta la intención en al menos 90 % de las preguntas escritas a mano', () => {
    const aciertos = PREGUNTAS_EVALUACION.filter((p) => responder(p.pregunta).intencion === p.intencion).length;
    expect(aciertos / PREGUNTAS_EVALUACION.length).toBeGreaterThanOrEqual(0.9);
  });

  it('responde con los mismos números que el dashboard', () => {
    const r = responder('cual es el share de exhibiciones en la serena');
    const cods = datos.tiendas.filter((t) => t.ciudad === 'La Serena').map((t) => t.codigo);
    const share = medir(datos.cortes[datos.cortes.length - 1], cods, 'exhibiciones').share!;
    const esperado = `${(Math.round(share * 1000) / 10).toFixed(1).replace('.', ',')}%`;
    expect(r.intencion).toBe('resumen');
    expect(r.respuesta.texto).toContain(esperado);
  });

  it('ordena el ranking de tiendas según la dirección pedida', () => {
    const peores = responder('las 3 tiendas mas debiles').respuesta.tabla!;
    const mejores = responder('las 3 tiendas mas fuertes').respuesta.tabla!;
    const valor = (s: string | number) => Number(String(s).replace('%', '').replace(',', '.'));
    expect(peores.filas).toHaveLength(3);
    expect(valor(peores.filas[0][2])).toBeLessThanOrEqual(valor(peores.filas[2][2]));
    expect(valor(mejores.filas[0][2])).toBeGreaterThanOrEqual(valor(mejores.filas[2][2]));
  });

  it('muestra el detalle cuando se nombra una tienda', () => {
    const r = responder('share de honor en dm 105');
    expect(r.intencion).toBe('detalle_tienda');
    expect(r.respuesta.texto).toContain('DM105');
  });

  it('no inventa respuestas fuera de su alcance', () => {
    expect(responder('cuál es la capital de francia').intencion).toBe('fuera');
  });

  it('compara grupos cuando se pide "por ciudad"', () => {
    const r = responder('share de muebles por ciudad');
    expect(r.intencion).toBe('por_grupo');
    expect(r.respuesta.tabla!.columnas[0]).toBe('Ciudad');
  });
});
