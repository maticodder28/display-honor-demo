import FotoExito from '@/presentacion/componentes/foto/FotoExito';
import Nav from '@/presentacion/componentes/comun/Nav';
import { contenedor } from '@/infraestructura/contenedor';
import { exigirAcceso } from '@/presentacion/acceso';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Foto del Éxito | Display Honor' };

export default async function FotoPage() {
  const app = contenedor();
  const { usuario, datos } = exigirAcceso(await app.cargarVista('foto', app.foto.datos), '/foto');
  return (
    <>
      <Nav usuario={usuario} vista="foto" />
      <main className="wrap">
        <FotoExito semanaActual={app.foto.semanaActual()} usuario={usuario} {...datos} />
      </main>
    </>
  );
}
