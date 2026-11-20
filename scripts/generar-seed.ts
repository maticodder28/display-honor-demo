/**
 * Genera supabase/seed.sql con los mismos datos del modo demo (tiendas reales, numeros ficticios).
 * Uso: npm run seed:demo
 *
 * Asi el repositorio publico no contiene datos reales y cualquiera puede levantar
 * la version con Supabase y ver el dashboard con informacion de ejemplo.
 */
import { writeFileSync } from 'node:fs';
import { fotoDemo, historialDemo, MARCAS_DEMO } from '../src/infraestructura/demo/datos';
import { METRICAS_DATOS } from '../src/dominio/display/modelo';

const q = (s: string | null | undefined) => (s == null ? 'null' : `'${s.replace(/'/g, "''")}'`);
const zona = "(select id from public.zonas where nombre = 'Norte')";

const h = historialDemo();
const foto = fotoDemo('2000-01-01');
const entel = new Map(foto.tiendas.map((t) => [t.codigo, t]));
const activas = h.tiendas.filter((t) => t.cobertura !== 'Cerrada').length;

const out: string[] = [
  '-- Datos de ejemplo para probar el proyecto con Supabase: tiendas reales de la Zona Norte, numeros ficticios.',
  '-- Generado por scripts/generar-seed.ts con los mismos datos del modo demo.',
  '-- Ejecutar DESPUES de schema.sql, en Supabase > SQL Editor. No necesita usuario admin.',
  '',
  'insert into public.marcas (nombre, orden) values',
  MARCAS_DEMO.map((m, i) => `  (${q(m)}, ${i + 1})`).join(',\n'),
  'on conflict (nombre) do update set orden = excluded.orden;',
  '',
  'insert into public.tiendas (codigo, nombre, cliente, ciudad, region, cobertura, zona_id, activa, codigo_b2b, codigo_corto, cluster, merchandiser) values',
  h.tiendas.map((t) => {
    const f = entel.get(t.codigo);
    return `  (${[q(t.codigo), q(t.tienda), q(t.cliente), q(t.ciudad), q(t.region), q(t.cobertura), zona, t.cobertura === 'Cerrada' ? 'false' : 'true',
      q(f?.codigo_b2b), q(f?.codigo_corto), q(f?.cluster), q(f?.merchandiser)].join(', ')})`;
  }).join(',\n'),
  'on conflict (codigo) do update set nombre = excluded.nombre, cliente = excluded.cliente, ciudad = excluded.ciudad,',
  '  region = excluded.region, cobertura = excluded.cobertura, zona_id = excluded.zona_id, activa = excluded.activa,',
  '  codigo_b2b = excluded.codigo_b2b, codigo_corto = excluded.codigo_corto, cluster = excluded.cluster, merchandiser = excluded.merchandiser;',
  '',
];

for (const c of h.cortes) {
  const resumen = Object.fromEntries(METRICAS_DATOS.map(([m]) => [m, `${Object.keys(c.metricas[m]).length}/${activas}`]));
  const filas: string[] = [];
  for (const [m] of METRICAS_DATOS)
    for (const [codigo, f] of Object.entries(c.metricas[m]))
      c.marcas.forEach((marca, i) => filas.push(`  (${q(codigo)}, ${q(m)}, ${q(marca)}, ${f.v[i]}, ${q(f.fecha)})`));
  out.push(
    `-- Corte ${c.fecha}`,
    'with c as (',
    '  insert into public.cargas (zona_id, archivo, marcas, resumen, fecha_corte)',
    `  values (${zona}, ${q(c.archivo)}, array[${c.marcas.map(q).join(', ')}], ${q(JSON.stringify(resumen))}::jsonb, ${q(c.fecha)})`,
    '  on conflict (zona_id, fecha_corte) do nothing',
    '  returning id',
    ')',
    'insert into public.mediciones (carga_id, tienda_codigo, metrica, marca, valor, fecha)',
    'select c.id, v.codigo, v.metrica, v.marca, v.valor, v.fecha::date from c, (values',
    filas.join(',\n'),
    ') as v (codigo, metrica, marca, valor, fecha);',
    '',
  );
}

out.push(
  '-- Foto del Exito: productos del mes y prioridades por cluster',
  'insert into public.foto_productos (id, nombre, corto, tipo, orden, activo) values',
  foto.productos.map((p) => `  (${p.id}, ${q(p.nombre)}, ${q(p.corto)}, ${q(p.tipo)}, ${p.orden}, ${p.activo})`).join(',\n'),
  'on conflict (id) do nothing;',
  "select setval(pg_get_serial_sequence('public.foto_productos', 'id'), (select max(id) from public.foto_productos));",
  '',
  'insert into public.foto_prioridades (producto_id, cluster, numero) values',
  foto.prioridades.map((p) => `  (${p.producto_id}, ${q(p.cluster)}, ${p.numero})`).join(',\n'),
  'on conflict (producto_id, cluster) do update set numero = excluded.numero;',
  '',
);

writeFileSync(new URL('../supabase/seed.sql', import.meta.url), out.join('\n'));
console.log(`seed.sql generado: ${h.tiendas.length} tiendas, ${h.cortes.length} cortes, ${foto.productos.length} productos.`);
