# Guía de instalación y uso

Guía para instalar la versión completa (con Supabase y login) y para el uso diario del equipo.
Para la descripción general del proyecto, ver el [README](../README.md).

## Puesta en marcha (una sola vez, ~20 minutos)

### 1. Crear la base de datos en Supabase

1. Entra a [supabase.com](https://supabase.com), crea una cuenta y un proyecto nuevo.
   Región sugerida: **South America (Sao Paulo)**. Guarda la contraseña de la base de datos.
2. Ve a **SQL Editor > New query**, pega el contenido completo de `supabase/schema.sql` y presiona **Run**.
3. Abre otra query, pega `supabase/seed.sql` y presiona **Run**. Esto carga datos de ejemplo: las 49 tiendas reales
   de la zona con números ficticios,
   10 marcas, 7 cortes y los productos de la Foto del Éxito. Para regenerarlos: `npm run seed:demo`.

### 2. Configurar el login

1. **Authentication > Sign In / Providers**: desactiva **Allow new users to sign up**.
   Así solo entra quien tú crees.
2. **Authentication > Users > Add user > Create new user**: crea tu usuario con correo y contraseña
   y marca **Auto Confirm User**. Repite para cada persona del equipo.
3. Hazte administrador. En **SQL Editor**, cambia el correo y ejecuta:

   ```sql
   update public.perfiles set rol = 'admin'
   where id = (select id from auth.users where email = 'tu-correo@ejemplo.com');
   ```

   Todos los demás usuarios quedan como **viewer**: ven el dashboard pero no pueden subir datos.

4. Para que el supervisor y el entrenador registren en la **Bitácora**, dales el rol `registro` y su nombre y cargo
   (así aparece en el historial). Cambia el correo y ejecuta una vez por persona:

   ```sql
   update public.perfiles set rol = 'registro', nombre = 'Nombre Apellido', cargo = 'Supervisor'
   where id = (select id from auth.users where email = 'correo@ejemplo.com');
   ```

   | Rol | Ve el dashboard y la bitácora | Registra en la bitácora | Sube el Excel |
   |---|---|---|---|
   | `admin` | Sí | Sí | Sí |
   | `registro` | Sí | Sí | No |
   | `viewer` | Sí | No | No |
   | `promotor` | Solo la Foto del Éxito de su tienda | No | No |

### 3. Probar en tu computador (opcional)

Si solo quieres ver la app, usa el modo demo (ver el README principal): no necesita Supabase.

Necesitas [Node.js 20 o superior](https://nodejs.org).

```bash
cp .env.example .env.local     # en Windows: copy .env.example .env.local
```

Completa `.env.local` con los datos de **Supabase > Project Settings > API** y deja `NEXT_PUBLIC_DEMO` vacío:
- `NEXT_PUBLIC_SUPABASE_URL`: el *Project URL*.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: la clave *anon public* (en proyectos nuevos se llama *publishable key*).

```bash
npm install
npm run dev
```

Abre <http://localhost:3000> e ingresa con tu usuario.

### 4. Publicar en Vercel

1. En [vercel.com](https://vercel.com) > **Add New > Project** > importa `display-honor`.
2. En **Environment Variables** agrega `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `NEXT_PUBLIC_ZONA=Norte`.
   Para publicar la demo en cambio, basta con `NEXT_PUBLIC_DEMO=1` (y opcionalmente `NEXT_PUBLIC_REPO_URL`).
3. **Deploy**. Quedará en una dirección tipo `display-honor.vercel.app`.
4. De vuelta en Supabase, **Authentication > URL Configuration > Site URL**: pon esa dirección.

Desde ahí, cada `git push` a `main` publica una nueva versión automáticamente.

`vercel.json` fija la región de las funciones en Sao Paulo (`gru1`), la misma de Supabase (`sa-east-1`), para que cada
consulta no cruce continentes. Si el proyecto de Supabase está en otra región, cambia `gru1` por la más cercana.

---

## Uso diario

- **Equipo:** entra con su correo y ve el dashboard. Nadie sin usuario puede ver los datos.
- **Muebles DC y Display Zone:** cada categoría tiene su hoja. El dashboard muestra Muebles como total (DC + Display Zone) y permite ver cada una por separado. Al leer el Excel también se acepta el nombre antiguo de hoja "Muebles DZ".
- **Admin > Descargar Excel actual:** baja los datos publicados en el formato de la plantilla.
- **Admin > Subir Excel:** la página revisa el archivo antes de publicar (hojas, marcas, códigos desconocidos,
  valores no numéricos) y muestra el share que va a quedar. Antes de publicar se elige la **fecha de corte**
  (propuesta: la fecha de levantamiento más reciente del Excel). Si ya existe un corte con esa fecha, se reemplaza.
  El dashboard siempre muestra el corte más reciente.
- Una fila vacía en Exhibiciones, Muebles DC, Display Zone o Promotores significa **sin levantamiento**; un 0 significa
  que la marca no tiene nada en esa tienda.
- Para agregar una marca, inserta su columna antes de **Total** en las cuatro hojas de levantamiento, con el mismo nombre.

## Bitácora de tiendas

Pestaña **Bitácora**: registro de lo que hace el equipo en cada tienda (visita, venta de ejecutivo, incentivo con
su costo, capacitación, implementación, observación), con pendientes que se marcan como hechos.

- **Visitas:** cualquier acción registrada en una tienda cuenta como visita, una por tienda y día. Esa regla se usa en
  el estado de la tienda (Al día / días sin visita), la última visita, el indicador Visitas del mes y el reporte.

- El **ranking de ejecutivos** es mensual y se calcula con las ventas registradas: Alto si el ejecutivo hace el
  40 % o más de los equipos Honor de la tienda en el mes, Medio entre 15 y 39 %, Bajo bajo 15 %.
- **Ejecutivos:** admin, supervisor y entrenador pueden agregarlos y **darlos de baja** cuando renuncian o rotan.
  No se borran: dejan de aparecer para nuevos registros, pero sus ventas e incentivos pasados se conservan en el
  historial, el ranking del mes en que vendieron y los reportes. Si vuelven, se reactivan (botón Reactivar o
  agregándolos con el mismo nombre).
- Cada registro guarda quién lo hizo. Solo su autor (o un admin) puede eliminarlo.
- **Descargar reporte** (botón junto al selector de mes): Excel con formato del mes elegido, con hojas Resumen
  (indicadores, por persona y por ciudad), Por tienda, Ranking ejecutivos, Incentivos (con total), Pendientes y
  Registro completo. Se genera en el navegador con `exceljs` (`src/lib/reporteBitacora.ts`).
- Datos en las tablas `acciones` y `ejecutivos` (ver `supabase/migraciones/2026-10-17_bitacora.sql`).

## Historial

Pestaña **Historial**: cada Excel publicado es un corte (foto completa) con su fecha.

- Evolución del share de Honor y sus tres rivales principales por corte, con los mismos filtros del dashboard.
- Share Honor por cliente en los últimos 8 cortes y su cambio desde el primero.
- **Comparar dos cortes:** cuántas tiendas mejoraron o empeoraron, detalle por tienda y descarga en Excel
  (hojas Resumen, Por tienda y Por cliente). El cambio se mide en puntos de share (pp).
- **Descargar** cualquier corte en el formato de la plantilla.
- Datos: `cargas.fecha_corte` (única por zona) y la función `historial_datos` (ver
  `supabase/migraciones/2026-10-17_historial.sql`). Las tiendas cerradas quedan fuera de todos los cortes.

## Foto del Éxito

Pestaña **Foto del Éxito**: checklist semanal (lunes a domingo) de qué productos Honor están exhibidos en cada
tienda Entel de la zona, más las mesas genéricas (no de marca) y sus equipos.

- **Quién llena:** cada promotor (rol `promotor`) llena solo su tienda, solo la semana actual. Las tiendas Middle
  Management las llena el equipo de zona (`admin` o `registro`), que también puede corregir hasta 4 semanas atrás.
  El formulario viene precargado con la semana anterior. Una respuesta por tienda y semana; se puede corregir.
- **Prioridades por cluster:** cada tienda tiene un cluster (K, A, B o C). Los equipos exigidos para cada cluster y su
  número están en `foto_prioridades` y se editan en la pestaña (admin). Cumplimiento = exigidos exhibidos / exigidos.
- **Productos del mes:** el admin los agrega, edita (nombre, abreviado, tipo) u oculta. Cada respuesta guarda la lista
  con que se llenó. Un producto ya usado en respuestas no se puede eliminar, solo ocultar (trigger `foto_producto_borrar`).
- **Copia semanal:** cada semana guarda su propia copia de las prioridades (`foto_semanas`). La semana actual sigue los
  cambios de la tabla; las pasadas quedan congeladas, así cada Excel y cada corrección usan los números de su semana.
- **Excel:** mismo formato del archivo "Foto del Éxito ENTEL": prioridades por cluster arriba, una fila por tienda,
  1/0 por producto, fecha, comentarios, mesas genéricas 1 a 8 y total de equipos (`src/lib/fotoExcel.ts`).
- **Promotores:** solo ven la Foto del Éxito de su tienda; el resto de la web los redirige ahí y la base no les
  entrega cortes, mediciones ni Bitácora. Para crear uno: crear el usuario en Supabase y luego

  ```sql
  update public.perfiles set rol = 'promotor', nombre = 'Nombre Apellido', cargo = 'Promotor',
    tienda_codigo = (select codigo from public.tiendas where codigo = 'DM101')
  where id = (select id from auth.users where email = 'correo@ejemplo.com');
  ```

## Celular

En pantallas de hasta 640 px la navegación pasa a una barra inferior (Display, Historial, Bitácora, Éxito Entel) y la
cuenta (tema, Admin, cerrar sesión) a un panel que se abre desde el círculo con las iniciales. Al cambiar de página
aparece una barra de carga arriba (`src/components/Progreso.tsx`).

## Seguridad

- Todas las páginas exigen sesión (middleware).
- La base de datos aplica **Row Level Security**: con sesión se puede leer; solo el rol `admin` puede escribir.
  Esto se valida en Postgres, no solo en la página.
- Un usuario no puede darse rol admin a sí mismo.
- La clave `anon` es pública por diseño (va en el navegador); la seguridad la ponen las reglas RLS.
  Nunca pongas la clave `service_role` en este proyecto.

## Cómo crecer

El modelo de datos ya está preparado para:

- **Ventas:** el Historial calcula todo con `medir(corte, tiendas, métrica)` en `src/lib/historial.ts`. Una métrica
  nueva (por ejemplo, unidades vendidas por marca) entra como otra hoja del Excel y otro valor de `metrica`, y aparece
  en la evolución y en las comparaciones sin cambiar esas pantallas.
- **Más zonas:** la tabla `zonas` ya tiene Norte, Centro y Sur. Se puede desplegar una copia por zona
  (cambiando `NEXT_PUBLIC_ZONA`) o agregar un selector de zona.
- **Fotos de exhibiciones:** Supabase Storage para adjuntar evidencia por tienda.
- **Roles por supervisor:** `perfiles.zona_id` permite limitar qué zona ve cada usuario.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor local en http://localhost:3000 |
| `npm run build` | Compila para producción |
| `npm run typecheck` | Revisa los tipos de TypeScript |
| `npm run lint` | Revisa el código con ESLint |
| `npm test` | Corre los tests (Vitest) |
| `npm run seed:demo` | Regenera `supabase/seed.sql` con los datos de la demo |
