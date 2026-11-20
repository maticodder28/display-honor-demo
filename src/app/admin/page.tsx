import Link from 'next/link';
import { ZONA } from '@/config';
import AdminPanel from '@/presentacion/componentes/admin/AdminPanel';
import Nav from '@/presentacion/componentes/comun/Nav';
import { contenedor } from '@/infraestructura/contenedor';
import { exigirAcceso } from '@/presentacion/acceso';

export const dynamic = 'force-dynamic';

export default async function Admin() {
  const app = contenedor();
  // Primero la sesión: los datos de Admin solo se piden si el usuario es admin.
  const { usuario } = exigirAcceso(await app.cargarVista('admin', async () => null), '/admin');

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

  const { actual, cargas, fechas } = await app.display.panelAdmin();
  return (
    <>
      <Nav usuario={usuario} vista="admin" actualizado={actual?.carga.created_at} />
      <main className="wrap">
        <div className="top">
          <div>
            <h1>Administración de datos</h1>
            <p className="sub">Sube el Excel de levantamiento de la Zona {ZONA}. Cada Excel queda guardado como un corte con su fecha en el Historial.</p>
          </div>
        </div>
        <AdminPanel zona={ZONA} actual={actual?.raw ?? null} historial={cargas} fechas={fechas} />
      </main>
    </>
  );
}
