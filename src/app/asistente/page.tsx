import { redirect } from 'next/navigation';
import Asistente from '@/components/Asistente';
import Nav from '@/components/Nav';
import { enParalelo, obtenerHistorial, usuarioActual } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Asistente | Display Honor' };

export default async function AsistentePage() {
  const pedido = enParalelo(obtenerHistorial());
  const usuario = await usuarioActual();
  if (!usuario) redirect('/login?next=/asistente');
  if (usuario.esPromotor) redirect('/foto');
  const datos = await pedido;
  return (
    <>
      <Nav usuario={usuario} vista="asistente" />
      <main className="wrap">
        <Asistente datos={datos} />
      </main>
    </>
  );
}
