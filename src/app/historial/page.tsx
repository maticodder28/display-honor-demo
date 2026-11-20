import Historial from '@/presentacion/componentes/display/Historial';
import Nav from '@/presentacion/componentes/comun/Nav';
import { contenedor } from '@/infraestructura/contenedor';
import { exigirAcceso } from '@/presentacion/acceso';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Historial | Display Honor' };

export default async function HistorialPage() {
  const app = contenedor();
  const { usuario, datos } = exigirAcceso(await app.cargarVista('historial', app.display.historial), '/historial');
  return (
    <>
      <Nav usuario={usuario} vista="historial" />
      <main className="wrap">
        <Historial {...datos} />
      </main>
    </>
  );
}
