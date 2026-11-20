# Documentación del código

Referencia técnica del proyecto: cómo está organizado, qué hace cada módulo y cómo extenderlo. Para usar la app está
el [manual](MANUAL.md); para instalarla, [INSTALACION.md](INSTALACION.md).

## Stack

| Capa | Tecnología |
|---|---|
| Interfaz y servidor | Next.js 15 (App Router), React 19, TypeScript estricto |
| Base de datos y login | Supabase: PostgreSQL, Auth y Row Level Security |
| Hosting | Vercel, región `gru1` (Sao Paulo), la misma que Supabase (`sa-east-1`) |
| Excel | SheetJS para leer y exportar plantillas, ExcelJS para reportes con formato |
| Gráficos | SVG propio con `d3-shape` |
| LLM (opcional) | Groq, API compatible con OpenAI |
| Pruebas | Vitest, Playwright y axe |

## Estructura

```
src/
  middleware.ts            Exige sesión en todas las páginas (en demo deja pasar)
  app/
    page.tsx               Display
    historial/ bitacora/ foto/ admin/ asistente/ login/
    api/asistente/route.ts Agente con Groq (POST) y su estado (GET)
    auth/salir/route.ts    Cierre de sesión
    layout.tsx globals.css Tema claro/oscuro y estilos
  components/              Componentes de cliente de cada pantalla, Nav, Donut, Iconos, Progreso
  lib/
    types.ts               Tipos y métricas
    data.ts                Todo el acceso a datos desde el servidor
    compute.ts             Agregados del Display
    historial.ts           Cortes, medir, comparar
    foto.ts                Semanas y cumplimiento de la Foto del Éxito
    excel.ts fotoExcel.ts reporteBitacora.ts   Excel
    format.ts              Formato de porcentajes, números y fechas
    modo.ts demo.ts        Modo demo
    supabase/              Clientes de Supabase (servidor, navegador, middleware)
    asistente/             Texto, entidades, clasificador, herramientas, motor, agente, modelo entrenado
supabase/
  schema.sql               Esquema completo (idempotente)
  migraciones/             Cambios incrementales para una base ya creada
  seed.sql                 Datos de ejemplo
scripts/                   entrenar-asistente.ts, generar-seed.ts, revisar-unicode.mjs
e2e/                       Pruebas de Playwright
```

## Flujo de una página

1. `middleware.ts` refresca la sesión de Supabase. Sin usuario, redirige a `/login?next=<ruta>`.
2. El `page.tsx` de la ruta (Server Component, `force-dynamic`) pide en paralelo la sesión (`usuarioActual`) y los
   datos (`obtenerDatos`, `obtenerHistorial`...). `enParalelo()` evita que un error de datos tape la redirección.
3. Si el usuario es promotor, se le manda a `/foto`.
4. La página renderiza `Nav` y el componente de cliente con los datos como props.
5. En el navegador, el componente calcula lo que necesita (por ejemplo `compute()` en el Display) y maneja filtros y
   formularios sin volver al servidor.
6. Las escrituras (Bitácora, Foto del Éxito, publicar el Excel) van directo desde el navegador a Supabase con el
   cliente de `lib/supabase/client.ts`. RLS decide si se permiten.

## Base de datos

| Tabla | Contenido |
|---|---|
| `zonas` | Norte, Centro y Sur |
| `perfiles` | Rol (`admin`, `registro`, `viewer`, `promotor`), nombre, cargo y tienda del promotor |
| `tiendas` | Código, nombre, cliente, ciudad, región, cobertura, `activa`; códigos Entel y cluster |
| `marcas` | Nombre y orden de columna |
| `cargas` | Un corte por Excel publicado, con `fecha_corte` única por zona y un resumen |
| `mediciones` | `(carga, tienda, métrica, marca) -> valor`, con la fecha de levantamiento |
| `ejecutivos`, `acciones` | Bitácora |
| `foto_productos`, `foto_prioridades`, `foto_respuestas`, `foto_semanas` | Foto del Éxito |

Funciones principales:

| Función | Qué hace |
|---|---|
| `publicar_carga(p jsonb)` | Valida rol admin y fecha, reemplaza el corte de esa fecha e inserta tiendas, marcas y mediciones en una transacción |
| `dashboard_datos(zona, carga)` | Devuelve en un JSON el corte más reciente (o el indicado) para el Display |
| `historial_datos(zona)` | Devuelve todos los cortes de la zona |
| `guardar_foto(...)` | Única vía para escribir la Foto del Éxito; valida tienda y semana según el rol |
| `es_admin()`, `es_promotor()` | Usadas por las políticas RLS |

Políticas RLS, en resumen: con sesión se lee; solo admin escribe cargas, mediciones y productos; `registro` y admin
escriben en la Bitácora y solo el autor (o un admin) borra; un promotor no lee cargas, mediciones ni Bitácora, y solo
lee y escribe la Foto del Éxito de su tienda; solo un admin cambia perfiles.

Triggers: `on_auth_user_created` crea el perfil al registrarse un usuario, `acciones_validar` revisa fechas y montos
de la Bitácora, y `foto_producto_borrar` impide borrar un producto ya usado.

## Módulos de cálculo

- `compute(raw)` en `compute.ts` recorre tienda, métrica y marca una sola vez y acumula para todas las combinaciones
  de cobertura, cliente y ciudad (incluida "Todas"). Devuelve mapas por clave `cobertura|cliente|ciudad|métrica`. El
  puesto es 1 más la cantidad de marcas con más unidades; los empates comparten puesto. Muebles se arma sumando DC
  y Display Zone por tienda.
- `medir(corte, códigos, métrica)` en `historial.ts` suma solo las tiendas con levantamiento y devuelve unidades por
  marca, total, share y puesto. La usan Historial, comparaciones y asistente.
- `comparar(A, B, tiendas, métrica)` devuelve por tienda el share antes y después y su tendencia. `tendencia()`
  redondea a 0,1 pp.
- `cumplimiento(respuesta)` en `foto.ts` es exigidos exhibidos dividido por exigidos.

## Excel

- `leerExcel(buffer)` lee el levantamiento con SheetJS y devuelve los datos más listas de errores y avisos.
- `aPayload()` arma el JSON para `publicar_carga`.
- `exportarExcel()` y `exportarComparacion()` generan plantillas y comparaciones; `reporteBitacora.ts` y
  `fotoExcel.ts` generan reportes con formato usando ExcelJS.
- Todo se carga con `import()` dinámico solo cuando se usa.

## Asistente

Pipeline en `src/lib/asistente/`:

| Archivo | Responsabilidad |
|---|---|
| `texto.ts` | `normalizar`, `tokens`, `raiz` (5 letras), `distancia` (Levenshtein con corte) y `parecida` |
| `entidades.ts` | `extraer(pregunta, catálogo)`: tienda (código, número o nombre), ciudad, cliente, marca, métrica, cobertura, cantidad y dirección, más la plantilla con marcadores |
| `clasificador.ts` | Características (raíces y bigramas), TF-IDF, softmax, `crearClasificador(modelo)` y `UMBRAL` (0,45) |
| `intenciones.ts` | Las 10 intenciones con nombre y ejemplo |
| `herramientas.ts` | Una función por intención que calcula la respuesta (texto, tabla, serie y sugerencias) |
| `motor.ts` | `crearMotor(modelo, datos)`: extracción, clasificación, reglas y `ejecutar()` |
| `agente.ts` | Agente con Groq: herramientas en formato OpenAI, bucle de hasta 5 rondas y verificador de cifras |
| `modelo.json` | Modelo entrenado (vocabulario, idf, pesos y sesgos), unos 21 KB comprimido |
| `evaluacion.ts` | 75 preguntas escritas a mano con su intención y entidades esperadas |

Entrenamiento: `npm run asistente:entrenar` ejecuta `scripts/entrenar-asistente.ts`. Genera unas 2.200 preguntas
desde plantillas, las pasa por el mismo extractor, separa 80/20, entrena regresión logística multinomial con Adam
(600 épocas, L2 1e-5), evalúa con las preguntas escritas a mano y escribe `modelo.json` y
`docs/asistente-evaluacion.md`. Es determinista: misma semilla, mismo modelo.

Reglas del motor, en orden: un saludo solo va a Ayuda; "por ciudad", "cada cliente" o varios clientes o ciudades
nombrados van a comparar grupos; bajo el umbral responde que no está seguro; si se nombra una tienda y la intención es
share o líder, pasa al detalle de la tienda.

Agente (`agente.ts` y `api/asistente/route.ts`): la ruta exige sesión (excepto en demo), limita a 8 preguntas cada
10 minutos por IP, valida el cuerpo y llama a `responderConAgente`. El agente manda el sistema, los últimos 3 turnos
y la pregunta; ejecuta las herramientas que pida el modelo con argumentos validados contra los datos; en la quinta
ronda fuerza `tool_choice: 'none'`; y al final verifica las cifras. Sin `GROQ_API_KEY`, el GET responde
`disponible: false` y la interfaz no muestra el modo Groq.

## Modo demo

Con `NEXT_PUBLIC_DEMO=1`: `data.ts` devuelve datos de `demo.ts`, el middleware no exige sesión, el cliente de
Supabase del navegador responde siempre con el aviso de demo y `layout.tsx` permite indexar la página. Los datos se
generan con semilla fija y fechas relativas a hoy. `npm run seed:demo` escribe esos mismos datos en `seed.sql`.

## Variables de entorno

| Variable | Dónde | Para qué |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Navegador y servidor | Conexión a Supabase (la clave anon es pública por diseño) |
| `NEXT_PUBLIC_ZONA` | Navegador y servidor | Zona que muestra el despliegue |
| `NEXT_PUBLIC_DEMO` | Navegador y servidor | `1` activa el modo demo |
| `NEXT_PUBLIC_REPO_URL` | Navegador | Link al código en la franja de la demo |
| `GROQ_API_KEY` | Solo servidor | Activa el agente |
| `GROQ_MODEL` | Solo servidor | Modelo de Groq (por defecto `openai/gpt-oss-20b`) |

## Pruebas

| Comando | Qué corre |
|---|---|
| `npm test` | 94 tests de Vitest en `src/**/*.test.ts` |
| `npm run test:e2e` | 31 pruebas de Playwright en `e2e/` sobre el modo demo, incluida la revisión de accesibilidad con axe |
| `npm run lint:unicode` | Falla si hay símbolos fuera de ASCII y tildes |

Localmente, `CHROME_PATH=/ruta/a/chrome npm run test:e2e` usa un Chrome instalado. El CI (`.github/workflows/ci.yml`)
corre tipos, lint, Unicode, tests, compilación y Playwright.

## Convenciones

- Nombres de variables, funciones y comentarios en español, salvo términos técnicos.
- Sin símbolos Unicode fuera de ASCII y tildes en ningún archivo de texto; en regex se usan escapes (`\u0300-\u036f`).
- La lógica de negocio va en `src/lib/` como funciones puras con tests; los componentes solo muestran y capturan.
- Los cambios de esquema van en `supabase/migraciones/` y también en `schema.sql`, que debe seguir siendo idempotente.

## Cómo extender

- **Una métrica nueva** (por ejemplo, ventas por marca): agrégala a `METRICAS_DATOS` en `types.ts` y como hoja en
  `excel.ts`. Historial y comparaciones la toman sin cambios porque todo pasa por `medir()`.
- **Otra zona:** la tabla `zonas` ya trae Norte, Centro y Sur. Se puede desplegar una copia por zona con
  `NEXT_PUBLIC_ZONA` o agregar un selector.
- **Una intención nueva en el asistente:** plantillas en `scripts/entrenar-asistente.ts`, la entrada en
  `intenciones.ts`, la función en `herramientas.ts`, el caso en `ejecutar()` de `motor.ts` y, si el agente la debe
  usar, en `HERRAMIENTAS` de `agente.ts`. Después, reentrenar.
- **Fotos de exhibición:** Supabase Storage, con una tabla que relacione foto, tienda y fecha.
