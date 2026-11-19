import { redirect } from 'next/navigation';
import Bitacora from '@/components/Bitacora';
import Nav from '@/components/Nav';
import { obtenerBitacora, usuarioActual, enParalelo } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bitácora | Display Honor' };

/** Fecha de hoy en Chile (YYYY-MM-DD), calculada en el servidor para que cliente y servidor coincidan. */
const hoyChile = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

export default async function BitacoraPage() {
  const pedido = enParalelo(obtenerBitacora());
  const usuario = await usuarioActual();
  if (!usuario) redirect('/login?next=/bitacora');
  if (usuario.esPromotor) redirect('/foto');
  const datos = await pedido;
  return (
    <>
      <Nav usuario={usuario} vista="bitacora" />
      <main className="wrap">
        <Bitacora
          hoy={hoyChile()}
          usuario={{ id: usuario.id, nombre: usuario.nombre, puedeRegistrar: usuario.puedeRegistrar, esAdmin: usuario.esAdmin }}
          {...datos}
        />
      </main>
    </>
  );
}
