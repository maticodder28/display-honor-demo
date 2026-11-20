'use client';
import { useState } from 'react';
import { CLUSTERS, leerPrioridad, type FotoPrioridad, type FotoProducto } from '@/dominio/foto/foto';
import { fijarPrioridad } from '@/presentacion/acciones/foto';
import type { Estado } from './formato';

interface Props { productos: FotoProducto[]; prioridades: FotoPrioridad[]; onCambio: (p: FotoPrioridad[]) => void }

/** Número de cada producto exigido por cluster de tienda (solo admin). Se guarda al salir del campo. */
export default function Prioridades({ productos, prioridades, onCambio }: Props) {
  const [estado, setEstado] = useState<Estado>(null);
  const lista = productos.filter((p) => p.activo).sort((a, b) => (a.tipo === b.tipo ? a.orden - b.orden : a.tipo === 'Equipo' ? -1 : 1));
  const valor = (pid: number, c: string) => prioridades.find((x) => x.producto_id === pid && x.cluster === c)?.numero ?? null;

  async function cambiar(p: FotoProducto, cluster: string, texto: string) {
    const leido = leerPrioridad(texto);
    if (!leido.ok) { setEstado({ ok: false, texto: 'El número debe estar entre 1 y 999, o vacío si no se exige.' }); return; }
    const n = leido.numero;
    if (n === valor(p.id, cluster)) return;
    const r = await fijarPrioridad(p.id, cluster, n);
    if (!r.ok) { setEstado({ ok: false, texto: r.falla.mensaje }); return; }
    const resto = prioridades.filter((x) => !(x.producto_id === p.id && x.cluster === cluster));
    onCambio(n == null ? resto : [...resto, { producto_id: p.id, cluster, numero: n }]);
    setEstado({ ok: true, texto: n == null ? `${p.nombre} ya no se exige en cluster ${cluster}.` : `${p.nombre}: Nro. ${n} en cluster ${cluster}.` });
  }

  return (
    <section className="card">
      <div className="ch">
        <h2>Prioridades por cluster</h2>
        <span className="hint">Nro. de cada equipo exigido en tiendas K, A, B y C. Vacío = no se exige en ese cluster.</span>
      </div>
      <div className="x">
        <table className="htab foto-prio">
          <thead><tr><th>Producto</th>{CLUSTERS.map((c) => <th key={c}>Tiendas {c}</th>)}</tr></thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id}>
                <td className="b">{p.nombre}</td>
                {CLUSTERS.map((c) => (
                  <td key={c}>
                    <input type="number" min={1} max={999} inputMode="numeric" aria-label={`Nro. de ${p.nombre} en cluster ${c}`}
                      defaultValue={valor(p.id, c) ?? ''} onBlur={(e) => cambiar(p, c, e.target.value)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {estado && <div className={'msg ' + (estado.ok ? 'o' : 'e')}>{estado.texto}</div>}
      <span className="hint">Los cambios se aplican a las respuestas nuevas o corregidas desde ahora; las semanas ya enviadas conservan sus exigidos.</span>
    </section>
  );
}
