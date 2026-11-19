import { redirect } from 'next/navigation';
import FotoExito from '@/components/FotoExito';
import Nav from '@/components/Nav';
import { obtenerFoto, usuarioActual, enParalelo } from '@/lib/data';
import { lunesDe, sumarDias } from '@/lib/foto';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Foto del Éxito | Display Honor' };

/** Fecha de hoy en Chile (YYYY-MM-DD). */
const hoyChile = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

export default async function FotoPage() {
  const semanaActual = lunesDe(hoyChile());
  const pedido = enParalelo(obtenerFoto(sumarDias(semanaActual, -7 * 25)));
  const usuario = await usuarioActual();
  if (!usuario) redirect('/login?next=/foto');
  const datos = await pedido;
  return (
    <>
      <Nav usuario={usuario} vista="foto" />
      <main className="wrap">
        <FotoExito
          semanaActual={semanaActual}
          usuario={{
            id: usuario.id, nombre: usuario.nombre, esAdmin: usuario.esAdmin, puedeRegistrar: usuario.puedeRegistrar,
            esPromotor: usuario.esPromotor, tiendaCodigo: usuario.tiendaCodigo,
          }}
          {...datos}
        />
      </main>
    </>
  );
}
