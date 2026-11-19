import { redirect } from 'next/navigation';
import Historial from '@/components/Historial';
import Nav from '@/components/Nav';
import { obtenerHistorial, usuarioActual, enParalelo } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Historial | Display Honor' };

export default async function HistorialPage() {
  const pedido = enParalelo(obtenerHistorial());
  const usuario = await usuarioActual();
  if (!usuario) redirect('/login?next=/historial');
  if (usuario.esPromotor) redirect('/foto');
  const datos = await pedido;
  return (
    <>
      <Nav usuario={usuario} vista="historial" />
      <main className="wrap">
        <Historial {...datos} />
      </main>
    </>
  );
}
