import Bitacora from '@/presentacion/componentes/bitacora/Bitacora';
import Nav from '@/presentacion/componentes/comun/Nav';
import { hoyEnChile } from '@/dominio/comun/fechas';
import { contenedor } from '@/infraestructura/contenedor';
import { exigirAcceso } from '@/presentacion/acceso';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bitácora | Display Honor' };

export default async function BitacoraPage() {
  const app = contenedor();
  const { usuario, datos } = exigirAcceso(await app.cargarVista('bitacora', app.bitacora.datos), '/bitacora');
  return (
    <>
      <Nav usuario={usuario} vista="bitacora" />
      <main className="wrap">
        {/* "Hoy" lo calcula el servidor, así el navegador y el servidor no discrepan cerca de medianoche. */}
        <Bitacora hoy={hoyEnChile()} usuario={usuario} {...datos} />
      </main>
    </>
  );
}
