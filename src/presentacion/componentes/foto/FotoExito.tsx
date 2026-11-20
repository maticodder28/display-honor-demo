'use client';
import { useMemo, useState } from 'react';
import { nombreSemana, type FotoDatos } from '@/dominio/foto/foto';
import type { Usuario } from '@/dominio/usuario';
import Formulario from './Formulario';
import Prioridades from './Prioridades';
import Productos from './Productos';
import VistaEquipo from './VistaEquipo';

interface Props extends FotoDatos {
  semanaActual: string;
  usuario: Usuario;
}

type Vista = 'equipo' | 'llenar' | 'productos';

/** Pantalla de la Foto del Éxito: elige qué pestañas ve cada rol y guarda el estado que comparten. */
export default function FotoExito(props: Props) {
  const { semanaActual, usuario, tiendas } = props;
  const [productos, setProductos] = useState(props.productos);
  const [prioridades, setPrioridades] = useState(props.prioridades);
  const [respuestas, setRespuestas] = useState(props.respuestas);
  // La semana actual usa la tabla vigente (refleja los cambios al tiro); las pasadas, su copia congelada.
  const copias = useMemo(() => new Map(props.semanasPrio.map((s) => [s.semana, s.prioridades])), [props.semanasPrio]);
  const prioDe = (sem: string) => (sem >= semanaActual ? prioridades : copias.get(sem) ?? prioridades);
  const verEquipo = !usuario.esPromotor;
  const puedeLlenar = usuario.puedeRegistrar || (usuario.esPromotor && !!usuario.tiendaCodigo);
  const [vista, setVista] = useState<Vista>(verEquipo ? 'equipo' : 'llenar');
  const nombre = useMemo(() => new Map(props.perfiles.map((p) => [p.id, p.nombre || 'Usuario'])), [props.perfiles]);

  // La semana actual y las que tienen respuestas, de la más nueva a la más antigua.
  const semanas = useMemo(
    () => [...new Set([semanaActual, ...respuestas.map((r) => r.semana)])].filter((s) => s <= semanaActual).sort().reverse(),
    [respuestas, semanaActual],
  );
  const [semana, setSemana] = useState(semanaActual);

  if (!tiendas.length) {
    return (
      <section className="card state">
        <h2>No hay tiendas para la Foto del Éxito</h2>
        <p>{usuario.esPromotor ? 'Tu usuario aún no tiene una tienda asignada. Pídeselo al administrador.' : 'No se encontraron tiendas Entel activas en la zona.'}</p>
      </section>
    );
  }

  const vistas: [Vista, string][] = [
    ...(verEquipo ? [['equipo', 'Vista del equipo'] as [Vista, string]] : []),
    ...(puedeLlenar ? [['llenar', usuario.esPromotor ? 'Llenar mi tienda' : 'Llenar Foto del Éxito'] as [Vista, string]] : []),
    ...(usuario.esAdmin ? [['productos', 'Productos del mes'] as [Vista, string]] : []),
  ];

  return (
    <>
      <header className="top">
        <div>
          <h1>Foto del Éxito | Entel</h1>
          <p className="sub">
            {usuario.esPromotor
              ? 'Marca cada semana qué productos Honor están exhibidos en tu tienda y cuántos equipos hay en mesas genéricas.'
              : 'Checklist semanal de exhibición (lunes a domingo). Cada promotor llena su tienda; el equipo de zona puede llenar o corregir cualquier tienda cuando la visita.'}
          </p>
        </div>
        <span className="hint">Semana actual: {nombreSemana(semanaActual)}</span>
      </header>

      {vistas.length > 1 && (
        <div className="foto-tabs" role="tablist" aria-label="Vistas">
          {vistas.map(([v, l]) => (
            <button key={v} type="button" role="tab" aria-selected={vista === v} className={vista === v ? 'on' : undefined} onClick={() => setVista(v)}>{l}</button>
          ))}
        </div>
      )}

      {vista === 'equipo' && verEquipo && (
        <VistaEquipo
          semana={semana} setSemana={setSemana} semanas={semanas} semanaActual={semanaActual}
          productos={productos} prioridades={prioDe(semana)} tiendas={tiendas} respuestas={respuestas} nombre={nombre}
        />
      )}
      {vista === 'llenar' && puedeLlenar && (
        <Formulario
          key={usuario.tiendaCodigo ?? 'equipo'}
          usuario={usuario} semanaActual={semanaActual} productos={productos} prioDe={prioDe} tiendas={tiendas}
          respuestas={respuestas} nombre={nombre}
          onGuardada={(r) => {
            setRespuestas((l) => [r, ...l.filter((x) => !(x.semana === r.semana && x.tienda_codigo === r.tienda_codigo))]);
            setSemana(r.semana);
          }}
        />
      )}
      {vista === 'productos' && usuario.esAdmin && (
        <>
          <Productos productos={productos} onCambio={setProductos} />
          <Prioridades productos={productos} prioridades={prioridades} onCambio={setPrioridades} />
        </>
      )}
    </>
  );
}
