import Link from 'next/link';
import Dashboard from '@/presentacion/componentes/display/Dashboard';
import Nav from '@/presentacion/componentes/comun/Nav';
import { fdate } from '@/dominio/comun/formato';
import { fechaMaxima } from '@/dominio/display/modelo';
import { contenedor } from '@/infraestructura/contenedor';
import { exigirAcceso } from '@/presentacion/acceso';

export const dynamic = 'force-dynamic';

export default async function Inicio() {
  const app = contenedor();
  const { usuario, datos } = exigirAcceso(await app.cargarVista('dashboard', app.display.corteActual), '/');
  const corte = datos ? fechaMaxima(datos.raw) : null;

  return (
    <>
      <Nav usuario={usuario} vista="dashboard" actualizado={datos?.carga.created_at} corte={corte ? fdate(corte) : null} />
      <main className="wrap">
        {datos ? (
          <Dashboard raw={datos.raw} />
        ) : (
          <section className="card state">
            <h2>Aún no hay datos cargados</h2>
            <p>Cuando un administrador suba el Excel de levantamiento, aquí aparecerá el share de Honor por cliente, ciudad y tienda.</p>
            {usuario.esAdmin && <Link className="abtn" href="/admin">Ir a Admin</Link>}
          </section>
        )}
      </main>
    </>
  );
}
