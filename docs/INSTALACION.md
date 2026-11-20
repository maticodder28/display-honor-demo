# Instalación

Esto es para montar la versión completa, con Supabase, login y roles. Si solo quieres ver la app, usa el modo demo
que explica el [README](../README.md). Para el uso del día a día está el [manual](MANUAL.md).

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

### 5. Crear promotores

Un promotor solo ve la Foto del Éxito de su tienda. Primero se crea su usuario en Supabase y después se le asigna la
tienda:

```sql
update public.perfiles set rol = 'promotor', nombre = 'Nombre Apellido', cargo = 'Promotor',
  tienda_codigo = (select codigo from public.tiendas where codigo = 'DM101')
where id = (select id from auth.users where email = 'correo@ejemplo.com');
```

### 6. Activar el agente con Groq (opcional)

El asistente funciona sin esto, con el modelo propio. El agente para preguntas abiertas se activa agregando
`GROQ_API_KEY` en las variables de entorno de Vercel, marcada como Sensitive (la clave se crea gratis en
[console.groq.com](https://console.groq.com)). Ojo: con el agente activo, las preguntas y los datos que consulta se
envían a Groq, que es un servicio externo. En una instalación con datos reales, actívalo solo si está autorizado.

## Seguridad

- Todas las páginas exigen sesión (middleware).
- La base de datos aplica **Row Level Security**: con sesión se puede leer; solo el rol `admin` puede escribir.
  Esto se valida en Postgres, no solo en la página.
- Un usuario no puede darse rol admin a sí mismo.
- La clave `anon` es pública por diseño (va en el navegador); la seguridad la ponen las reglas RLS.
  Nunca pongas la clave `service_role` en este proyecto.
- La clave de Groq va solo en el servidor. Nunca uses un nombre que empiece con `NEXT_PUBLIC_` para ella, porque esas
  variables llegan al navegador.
