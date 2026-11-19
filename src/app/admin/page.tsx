import Link from 'next/link';
import { redirect } from 'next/navigation';
import AdminPanel from '@/components/AdminPanel';
import Nav from '@/components/Nav';
import { ZONA, fechasCorte, historialCargas, obtenerDatos, usuarioActual } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function Admin() {
  const usuario = await usuarioActual();
  if (!usuario) redirect('/login?next=/admin');
  if (usuario.esPromotor) redirect('/foto');

  if (!usuario.esAdmin) {
    return (
      <>
        <Nav usuario={usuario} vista="admin" />
        <main className="wrap">
          <section className="card state">
            <h2>Solo administradores</h2>
            <p>Para subir datos tu usuario necesita el rol admin. Pídele a quien administra el proyecto que te lo asigne en Supabase (tabla perfiles).</p>
            <Link className="abtn ghost" href="/">Volver al dashboard</Link>
          </section>
        </main>
      </>
    );
  }

  const [datos, historial, fechas] = await Promise.all([obtenerDatos(), historialCargas(), fechasCorte()]);
  return (
    <>
      <Nav usuario={usuario} vista="admin" actualizado={datos?.carga.created_at} />
      <main className="wrap">
        <div className="top">
          <div>
            <h1>Administración de datos</h1>
            <p className="sub">Sube el Excel de levantamiento de la Zona {ZONA}. Cada Excel queda guardado como un corte con su fecha en el Historial.</p>
          </div>
        </div>
        <AdminPanel zona={ZONA} actual={datos?.raw ?? null} historial={historial} fechas={fechas} />
      </main>
    </>
  );
}
