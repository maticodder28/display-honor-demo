import Link from 'next/link';
import { redirect } from 'next/navigation';
import Dashboard from '@/components/Dashboard';
import Nav from '@/components/Nav';
import { obtenerDatos, usuarioActual, enParalelo } from '@/lib/data';
import { fdate } from '@/lib/format';
import { METRICAS_DATOS } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function Inicio() {
  // La sesión y los datos se piden en paralelo (los permisos los aplica la base de datos).
  const pedido = enParalelo(obtenerDatos());
  const usuario = await usuarioActual();
  if (!usuario) redirect('/login');
  if (usuario.esPromotor) redirect('/foto');
  const datos = await pedido;

  let corte = '';
  if (datos) for (const [m] of METRICAS_DATOS) for (const r of Object.values(datos.raw.metricas[m])) if (r.fecha && r.fecha > corte) corte = r.fecha;

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
