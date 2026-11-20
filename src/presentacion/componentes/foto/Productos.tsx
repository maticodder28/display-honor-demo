'use client';
import { useState } from 'react';
import { normalizarProducto, type FotoProducto, type TipoProducto } from '@/dominio/foto/foto';
import { activarProducto, crearProducto, editarProducto, eliminarProducto } from '@/presentacion/acciones/foto';
import type { Estado } from './formato';

interface Props { productos: FotoProducto[]; onCambio: (p: FotoProducto[]) => void }
type Edicion = { id: number; nombre: string; corto: string; tipo: TipoProducto };

/** Productos que se piden en la Foto (solo admin). */
export default function Productos({ productos, onCambio }: Props) {
  const [nuevo, setNuevo] = useState({ nombre: '', corto: '', tipo: 'Equipo' as TipoProducto });
  const [editando, setEditando] = useState<Edicion | null>(null);
  const [estado, setEstado] = useState<Estado>(null);
  const activos = productos.filter((p) => p.activo).length;
  const error = (texto: string) => setEstado({ ok: false, texto });

  async function alternar(p: FotoProducto) {
    const r = await activarProducto(p.id, !p.activo);
    if (!r.ok) return error(r.falla.mensaje);
    onCambio(productos.map((x) => (x.id === p.id ? { ...x, activo: !x.activo } : x)));
    setEstado({ ok: true, texto: p.activo ? `${p.nombre} deja de pedirse desde la próxima respuesta.` : `${p.nombre} vuelve a pedirse.` });
  }

  async function guardarEdicion() {
    if (!editando) return;
    const r = await editarProducto(editando.id, editando);
    if (!r.ok) return error(r.falla.codigo === 'duplicado' ? 'Ya existe otro producto con ese nombre.' : r.falla.mensaje);
    // El servidor limpia el nombre y arma el abreviado; aplico la misma regla para mostrarlo igual.
    const n = normalizarProducto(editando);
    if (typeof n !== 'string') onCambio(productos.map((x) => (x.id === editando.id ? { ...x, ...n } : x)));
    setEditando(null);
    setEstado({ ok: true, texto: `${editando.nombre.trim()} se actualizó.` });
  }

  async function eliminar(p: FotoProducto) {
    if (!window.confirm(`¿Eliminar ${p.nombre}? Esto no se puede deshacer.`)) return;
    const r = await eliminarProducto(p.id);
    // Si ya aparece en respuestas enviadas la base no deja borrarlo (se perdería la historia): solo ocultarlo.
    if (!r.ok) return error(r.falla.codigo === 'en_uso' ? `${p.nombre} ya está en respuestas enviadas: no se puede eliminar, ocúltalo con el botón "Se pide".` : r.falla.mensaje);
    onCambio(productos.filter((x) => x.id !== p.id));
    setEditando(null);
    setEstado({ ok: true, texto: `${p.nombre} se eliminó.` });
  }

  async function agregar() {
    // Los nuevos quedan al final de la lista.
    const orden = Math.max(0, ...productos.map((p) => p.orden)) + 10;
    const r = await crearProducto(nuevo, orden);
    if (!r.ok) return error(r.falla.codigo === 'duplicado' ? 'Ese producto ya existe: actívalo en la lista.' : r.falla.mensaje);
    onCambio([...productos, r.valor]);
    setNuevo({ nombre: '', corto: '', tipo: nuevo.tipo });
    setEstado({ ok: true, texto: `${r.valor.nombre} se agregó y se pedirá desde la próxima respuesta.` });
  }

  return (
    <div className="bit-two">
      <section className="card">
        <div className="ch"><h2>Productos que se piden</h2><span className="hint">{activos} de {productos.length} activos</span></div>
        <div className="x">
          <table className="htab">
            <thead><tr><th>Producto</th><th>Abreviado</th><th>Tipo</th><th>En la Foto</th><th></th></tr></thead>
            <tbody>
              {productos.map((p) => editando?.id === p.id ? (
                <tr key={p.id}>
                  <td><input type="text" maxLength={60} value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} aria-label="Nombre" /></td>
                  <td><input type="text" maxLength={20} value={editando.corto} onChange={(e) => setEditando({ ...editando, corto: e.target.value })} aria-label="Abreviado" /></td>
                  <td>
                    <select value={editando.tipo} onChange={(e) => setEditando({ ...editando, tipo: e.target.value as TipoProducto })} aria-label="Tipo">
                      <option value="Equipo">Equipo</option>
                      <option value="Accesorio">Accesorio</option>
                    </select>
                  </td>
                  <td colSpan={2}>
                    <div className="pills">
                      <button type="button" onClick={guardarEdicion}>Guardar</button>
                      <button type="button" onClick={() => setEditando(null)}>Cancelar</button>
                      <button type="button" onClick={() => eliminar(p)}>Eliminar</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={p.id} className={p.activo ? undefined : 'pend'}>
                  <td className={p.activo ? 'b' : 's-mut'}>{p.nombre}</td>
                  <td className="s-mut">{p.corto}</td>
                  <td className="s-mut">{p.tipo}</td>
                  <td>
                    <div className="pills"><button type="button" aria-pressed={p.activo} onClick={() => alternar(p)}>{p.activo ? 'Se pide' : 'Oculto'}</button></div>
                  </td>
                  <td>
                    <div className="pills"><button type="button" onClick={() => { setEstado(null); setEditando({ id: p.id, nombre: p.nombre, corto: p.corto, tipo: p.tipo }); }}>Editar</button></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card bit-form">
        <div className="ch"><h2>Agregar producto</h2></div>
        <label className="bit-lbl">Nombre
          <input type="text" maxLength={60} value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Ej. Honor Magic 8 Pro" />
        </label>
        <div className="bit-grid">
          <label className="bit-lbl">Abreviado (columna)
            <input type="text" maxLength={20} value={nuevo.corto} onChange={(e) => setNuevo({ ...nuevo, corto: e.target.value })} placeholder="Ej. Magic 8 Pro" />
          </label>
          <label className="bit-lbl">Tipo
            <select value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value as TipoProducto })}>
              <option value="Equipo">Equipo</option>
              <option value="Accesorio">Accesorio</option>
            </select>
          </label>
        </div>
        {estado && <div className={'msg ' + (estado.ok ? 'o' : 'e')}>{estado.texto}</div>}
        <button className="abtn" type="button" onClick={agregar}>Agregar a la Foto</button>
        <span className="hint">Un producto oculto deja de pedirse, pero lo ya registrado se mantiene en las semanas anteriores. Las respuestas ya enviadas conservan la lista con la que se llenaron. Con el botón Editar corriges nombre, abreviado o tipo; solo se puede eliminar un producto que todavía no aparece en ninguna respuesta.</span>
      </section>
    </div>
  );
}
