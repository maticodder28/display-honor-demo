import Asistente from '@/presentacion/componentes/asistente/Asistente';
import Nav from '@/presentacion/componentes/comun/Nav';
import { contenedor } from '@/infraestructura/contenedor';
import { exigirAcceso } from '@/presentacion/acceso';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Asistente | Display Honor' };

export default async function AsistentePage() {
  const app = contenedor();
  const { usuario, datos } = exigirAcceso(await app.cargarVista('asistente', app.display.historial), '/asistente');
  return (
    <>
      <Nav usuario={usuario} vista="asistente" />
      <main className="wrap">
        <Asistente datos={datos} />
      </main>
    </>
  );
}
