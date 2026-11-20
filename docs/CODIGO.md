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

## Arquitectura

El código sigue Clean Architecture: cuatro capas, y cada una solo puede depender de las que están más adentro.

```
  presentacion  ->  aplicacion  ->  dominio
        |                ^
        v                |
  infraestructura -------+   (implementa los puertos de aplicacion)
```

| Capa | Qué tiene | De qué depende |
|---|---|---|
| `dominio/` | Tipos y reglas del negocio como funciones puras: share, historial, bitácora, Foto del Éxito, usuario y permisos, asistente | De nada (ni React, ni Next, ni Supabase) |
| `aplicacion/` | Casos de uso (qué puede hacer cada usuario y en qué orden) y puertos: las interfaces de repositorios, sesión y modelo de lenguaje | Solo del dominio |
| `infraestructura/` | Implementaciones de los puertos: Supabase, demo, Groq. Adaptadores de Excel. El `contenedor`, que arma todo | De aplicación y dominio |
| `presentacion/` + `app/` | Páginas de Next, componentes, server actions | De los casos de uso a través del contenedor y de las server actions |

La regla de dependencias no es solo una convención: `.eslintrc.json` la hace cumplir con `no-restricted-imports`.
Si un componente importa Supabase o el dominio importa React, el lint falla.

Cómo se ven los principios SOLID en el código:

- **Responsabilidad única:** cada caso de uso hace una cosa; las pantallas grandes (Bitácora, Foto del Éxito) están
  partidas en componentes chicos y un hook, y sus cálculos viven en el dominio.
- **Abierto/cerrado:** el modo demo no es un `if (DEMO)` repetido en cada consulta: es otra implementación de los
  mismos repositorios. Para cambiar de base de datos se escribe otro repositorio, sin tocar casos de uso ni pantallas.
- **Sustitución de Liskov:** los repositorios de Supabase y de la demo cumplen el mismo contrato y son
  intercambiables; los e2e corren sobre la demo y la app real sobre Supabase con el mismo código de pantalla.
- **Segregación de interfaces:** un puerto por área (`RepositorioDisplay`, `RepositorioBitacora`, `RepositorioFoto`,
  `ServicioSesion`, `ModeloLenguaje`), no un repositorio gigante.
- **Inversión de dependencias:** los casos de uso reciben sus dependencias (`crearCasosBitacora({ repo, sesion, hoy })`).
  Por eso se prueban con repositorios falsos en memoria (`aplicacion/casos-de-uso/casos.test.ts`). Hasta el reloj se
  inyecta, para que las pruebas no dependan de la fecha.

## Estructura

```
src/
  config.ts                      DEMO y ZONA (variables de entorno)
  middleware.ts                  Exige sesión en todas las páginas (en demo deja pasar)
  dominio/
    comun/                       Resultado (ok o falla), fechas y formatos
    usuario.ts                   Roles, permisos y destino seguro después del login
    display/                     modelo.ts (métricas y tipos), share.ts (agregados), historial.ts (cortes, medir, comparar)
    bitacora/bitacora.ts         Estado de visita, KPIs del mes, ranking de ejecutivos y validaciones
    foto/foto.ts                 Semanas, cumplimiento, resumen de la semana, precarga del formulario, productos
    asistente/                   Texto, entidades, clasificador, herramientas, motor, piezas del agente, modelo.json
  aplicacion/
    puertos.ts                   Interfaces que implementa la infraestructura
    casos-de-uso/                acceso, display, bitacora, foto, sesion, asistente (con el ciclo del agente)
  infraestructura/
    contenedor.ts                Raíz de composición: elige Supabase o demo y arma los casos de uso
    supabase/                    Cliente de servidor, middleware, sesión y repositorios
    demo/                        Generador de datos (datos.ts) y repositorios que no guardan
    groq/modelo.ts               Adaptador de Groq (implementa ModeloLenguaje)
    excel/                       Leer y exportar el levantamiento, reporte de la Bitácora, Excel de la Foto
  presentacion/
    acceso.ts                    Convierte la decisión de acceso en redirección
    acciones/                    Server actions: la única forma en que la interfaz escribe
    componentes/                 comun/, display/, admin/, bitacora/, foto/, asistente/
  app/                           Rutas de Next: páginas delgadas que llaman al contenedor
supabase/
  schema.sql                     Esquema completo (idempotente)
  migraciones/                   Cambios incrementales para una base ya creada
  seed.sql                       Datos de ejemplo
scripts/                         entrenar-asistente.ts, generar-seed.ts, revisar-unicode.mjs
e2e/                             Pruebas de Playwright
```

## Flujo de una página

1. `middleware.ts` refresca la sesión de Supabase. Sin usuario, redirige a `/login?next=<ruta>`.
2. El `page.tsx` crea el contenedor y llama a `cargarVista(vista, casoDeUso)`. Ese caso de uso pide la sesión y los
   datos en paralelo y decide: ir al login, mandar al promotor a `/foto` o mostrar la página.
3. La página renderiza `Nav` y el componente de cliente con los datos como props.
4. En el navegador, el componente calcula lo que necesita con funciones del dominio (por ejemplo `compute()` en el
   Display) y maneja filtros y formularios sin volver al servidor.

## Flujo de una escritura

```
Componente -> server action (presentacion/acciones) -> caso de uso -> puerto -> repositorio Supabase o demo
```

El componente valida con las mismas reglas del dominio para avisar al tiro. El caso de uso revisa el permiso y vuelve
a validar, porque lo que llega del navegador no es confiable. El repositorio traduce los errores de Postgres (por
ejemplo `23505`, duplicado) a una `Falla` con código, y la pantalla elige el mensaje. Al final RLS decide igual en la
base: son tres barreras, no una.

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

- `compute(raw)` en `dominio/display/share.ts` recorre tienda, métrica y marca una sola vez y acumula para todas las combinaciones
  de cobertura, cliente y ciudad (incluida "Todas"). Devuelve mapas por clave `cobertura|cliente|ciudad|métrica`. El
  puesto es 1 más la cantidad de marcas con más unidades; los empates comparten puesto. Muebles se arma sumando DC
  y Display Zone por tienda.
- `medir(corte, códigos, métrica)` en `dominio/display/historial.ts` suma solo las tiendas con levantamiento y devuelve unidades por
  marca, total, share y puesto. La usan Historial, comparaciones y asistente.
- `comparar(A, B, tiendas, métrica)` devuelve por tienda el share antes y después y su tendencia. `tendencia()`
  redondea a 0,1 pp.
- `cumplimiento(respuesta)` en `dominio/foto/foto.ts` es exigidos exhibidos dividido por exigidos; `resumenSemana()`
  arma los indicadores de la vista del equipo.
- `estadoVisita()`, `resumenMes()` y `rankingEjecutivos()` en `dominio/bitacora/bitacora.ts` calculan lo que muestra
  la Bitácora.

## Excel

Están en `infraestructura/excel/` y corren en el navegador.

- `leerExcel(buffer)` lee el levantamiento con SheetJS y devuelve los datos más listas de errores y avisos. Lo que se
  manda a publicar ya son datos del dominio; el JSON para `publicar_carga` lo arma el repositorio de Supabase.
- `exportarExcel()` y `exportarComparacion()` generan plantillas y comparaciones; `reporteBitacora.ts` y
  `fotoSemana.ts` generan reportes con formato usando ExcelJS.
- Todo se carga con `import()` dinámico solo cuando se usa.

## Asistente

Pipeline en `src/dominio/asistente/` (todo puro, corre en el navegador):

| Archivo | Responsabilidad |
|---|---|
| `texto.ts` | `normalizar`, `tokens`, `raiz` (5 letras), `distancia` (Levenshtein con corte) y `parecida` |
| `entidades.ts` | `extraer(pregunta, catálogo)`: tienda (código, número o nombre), ciudad, cliente, marca, métrica, cobertura, cantidad y dirección, más la plantilla con marcadores |
| `clasificador.ts` | Características (raíces y bigramas), TF-IDF, softmax, `crearClasificador(modelo)` y `UMBRAL` (0,45) |
| `intenciones.ts` | Las 10 intenciones con nombre y ejemplo |
| `herramientas.ts` | Una función por intención que calcula la respuesta (texto, tabla, serie y sugerencias) |
| `motor.ts` | `crearMotor(modelo, datos)`: extracción, clasificación, reglas y `ejecutar()` |
| `agente.ts` | Piezas del agente: instrucciones, herramientas en formato OpenAI, ejecución de cada pedido y verificador de cifras |
| `modelo.json` | Modelo entrenado (vocabulario, idf, pesos y sesgos), unos 21 KB comprimido |
| `evaluacion.ts` | 75 preguntas escritas a mano con su intención y entidades esperadas |

Entrenamiento: `npm run asistente:entrenar` ejecuta `scripts/entrenar-asistente.ts`. Genera unas 2.200 preguntas
desde plantillas, las pasa por el mismo extractor, separa 80/20, entrena regresión logística multinomial con Adam
(600 épocas, L2 1e-5), evalúa con las preguntas escritas a mano y escribe `modelo.json` y
`docs/asistente-evaluacion.md`. Es determinista: misma semilla, mismo modelo.

Reglas del motor, en orden: un saludo solo va a Ayuda; "por ciudad", "cada cliente" o varios clientes o ciudades
nombrados van a comparar grupos; bajo el umbral responde que no está seguro; si se nombra una tienda y la intención es
share o líder, pasa al detalle de la tienda.

Agente: `api/asistente/route.ts` limita a 8 preguntas cada 10 minutos por IP y llama al caso de uso `preguntar`
(`aplicacion/casos-de-uso/asistente.ts`), que exige sesión, valida la pregunta y corre `responderConAgente`. Ese ciclo
habla con el puerto `ModeloLenguaje`; la llamada HTTP a Groq está en `infraestructura/groq/modelo.ts`. El agente manda el sistema, los últimos 3 turnos
y la pregunta; ejecuta las herramientas que pida el modelo con argumentos validados contra los datos; en la quinta
ronda fuerza `tool_choice: 'none'`; y al final verifica las cifras. Sin `GROQ_API_KEY`, el GET responde
`disponible: false` y la interfaz no muestra el modo Groq.

## Modo demo

Con `NEXT_PUBLIC_DEMO=1` el contenedor usa los repositorios de `infraestructura/demo/`: leen datos generados con
semilla fija y fechas relativas a hoy, y toda escritura responde con el aviso de demo. El middleware no exige sesión y
`layout.tsx` permite indexar la página. `npm run seed:demo` escribe esos mismos datos en `seed.sql`.

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
| `npm test` | 120 tests de Vitest en `src/**/*.test.ts`: dominio, casos de uso con repositorios falsos y el agente con un Groq falso |
| `npm run test:e2e` | 31 pruebas de Playwright en `e2e/` sobre el modo demo, incluida la revisión de accesibilidad con axe |
| `npm run lint:unicode` | Falla si hay símbolos fuera de ASCII y tildes |

Localmente, `CHROME_PATH=/ruta/a/chrome npm run test:e2e` usa un Chrome instalado. El CI (`.github/workflows/ci.yml`)
corre tipos, lint, Unicode, tests, compilación y Playwright.

## Convenciones

- Nombres de variables, funciones y comentarios en español, salvo términos técnicos.
- Sin símbolos Unicode fuera de ASCII y tildes en ningún archivo de texto; en regex se usan escapes (`\u0300-\u036f`).
- La lógica de negocio va en `src/dominio/` como funciones puras con tests; los componentes solo muestran y capturan.
- Lo que puede fallar devuelve un `Resultado` (`{ ok, valor }` o `{ ok: false, falla }`) en vez de lanzar errores.
- Los comentarios explican el porqué, no el qué: si el código ya lo dice, no se comenta.
- Los cambios de esquema van en `supabase/migraciones/` y también en `schema.sql`, que debe seguir siendo idempotente.

## Cómo extender

- **Una métrica nueva** (por ejemplo, ventas por marca): agrégala a `METRICAS_DATOS` en `dominio/display/modelo.ts` y como
  hoja en `infraestructura/excel/levantamiento.ts`. Historial y comparaciones la toman sin cambios porque todo pasa por `medir()`.
- **Otra zona:** la tabla `zonas` ya trae Norte, Centro y Sur. Se puede desplegar una copia por zona con
  `NEXT_PUBLIC_ZONA` o agregar un selector.
- **Una intención nueva en el asistente:** plantillas en `scripts/entrenar-asistente.ts`, la entrada en
  `intenciones.ts`, la función en `herramientas.ts`, el caso en `ejecutar()` de `motor.ts` y, si el agente la debe
  usar, en `HERRAMIENTAS` de `agente.ts`. Después, reentrenar.
- **Fotos de exhibición:** un método nuevo en el puerto (`subirFoto`), su implementación con Supabase Storage y otra
  en la demo. Los casos de uso y las pantallas no se enteran de dónde se guardan.
- **Otra base de datos u otro LLM:** otra implementación del puerto y un cambio en `contenedor.ts`. Nada más.
