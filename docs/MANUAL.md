# Manual de uso

Este manual es para el equipo que usa la app en el día a día. Cómo instalarla está en [INSTALACION.md](INSTALACION.md).

## Entrar

Entra con el correo y la contraseña que te entregó el administrador. Lo que puedes hacer depende de tu rol:

| Rol | Ve Display, Historial y Asistente | Registra en la Bitácora | Llena la Foto del Éxito | Sube el Excel |
|---|---|---|---|---|
| `admin` | Sí | Sí | Cualquier tienda, hasta 4 semanas atrás | Sí |
| `registro` (supervisor, entrenador) | Sí | Sí | Cualquier tienda, hasta 4 semanas atrás | No |
| `viewer` | Sí | No | No | No |
| `promotor` | No | No | Solo su tienda, solo la semana actual | No |

En la demo pública no hay login y nada se guarda.

## Display

Es la pantalla principal. Arriba eliges los filtros (cobertura, cliente, ciudad y métrica) y todo lo de abajo se
actualiza.

- Las tarjetas muestran el share de Honor en exhibiciones, muebles y promotores, con su puesto entre las 10 marcas.
  Verde es primer lugar, amarillo segundo o tercero, rojo cuarto o peor.
- Muebles es la suma de Muebles DC y Display Zone. En la tabla "Por métrica" se ven por separado.
- Las tarjetas de Cobertura Promotor y Middle Management también sirven de filtro: haz clic en una.
- En "Detalle de tiendas" puedes ordenar por cualquier columna, buscar una tienda por nombre o código, y ver solo las
  tiendas donde Honor no lidera o las que no tienen levantamiento.

## Historial

Cada Excel que se publica queda guardado como un corte con su fecha.

- El gráfico muestra cómo se movió el share de Honor y de sus tres rivales principales, con los mismos filtros del
  Display.
- "Comparar dos cortes" te dice cuántas tiendas mejoraron o empeoraron y el detalle tienda por tienda. El cambio se
  mide en puntos de share (pp). Lo puedes descargar en Excel.
- Cualquier corte se puede descargar en el formato de la plantilla.

## Bitácora

Aquí se registra lo que hacemos en cada tienda: visitas, ventas de ejecutivos, incentivos con su costo,
capacitaciones, implementaciones y observaciones.

1. Elige la tienda en la lista de la izquierda. Arriba de la lista puedes filtrar las que llevan días sin visita o
   las que tienen pendientes.
2. En "Registrar acción" elige el tipo, la fecha y, si corresponde, el ejecutivo, las unidades o el costo.
3. Marca "Dejar como pendiente" si queda algo por hacer. Después lo marcas como hecho desde la misma tienda.

Cosas a saber:

- Cualquier acción cuenta como visita, una por tienda y día. Con eso se calcula si la tienda está al día.
- El ranking de ejecutivos es mensual: Alto si el ejecutivo vendió el 40 % o más de los equipos Honor de su tienda,
  Medio entre 15 y 39 %, Bajo bajo 15 %.
- Cuando un ejecutivo renuncia o rota, dalo de baja en vez de borrarlo. Sus ventas pasadas se mantienen. Si vuelve,
  se reactiva.
- Solo quien hizo un registro, o un admin, puede eliminarlo.
- "Descargar reporte" baja un Excel del mes con resumen, estado por tienda, ranking, incentivos, pendientes y el
  registro completo.

## Foto del Éxito

Es el checklist semanal (lunes a domingo) de qué productos Honor están exhibidos en cada tienda Entel, más las mesas
genéricas.

- **Promotores:** al entrar ven directo el formulario de su tienda. Viene precargado con lo de la semana anterior, así
  que solo se cambia lo que se movió. Se puede corregir durante la semana.
- **Equipo de zona:** "Vista del equipo" muestra qué tiendas respondieron, el cumplimiento de cada una y el producto
  exigido con menos presencia. Las tiendas Middle Management las llena el equipo de zona.
- El cumplimiento es exigidos exhibidos dividido por exigidos. Lo exigido depende del cluster de la tienda (K, A, B
  o C).
- **Admin:** en "Productos del mes" se agregan, editan u ocultan productos y se fijan las prioridades por cluster.
  Un producto que ya se usó en respuestas no se puede borrar, solo ocultar.
- "Descargar Excel de la semana" baja el archivo en el formato que pide Entel.

## Subir un levantamiento (Admin)

1. En Admin, descarga el Excel actual. Ya trae las tiendas y marcas al día.
2. Completa las hojas Exhibiciones, Muebles DC, Display Zone y Promotores.
3. Súbelo. La página lo revisa antes de publicar y te muestra el share que va a quedar.
4. Revisa la fecha de corte (por defecto, la fecha de levantamiento más reciente del Excel) y publica.

Ojo con esto:

- Una fila vacía significa que esa tienda no se midió y no cuenta. Un 0 significa que la marca no tiene nada ahí y sí
  cuenta. No es lo mismo.
- Si ya existe un corte con esa fecha, se reemplaza. La página te avisa antes.
- Para agregar una marca, inserta su columna antes de Total en las cuatro hojas, con el mismo nombre.

## Asistente

Le puedes preguntar a los datos como le preguntarías a un compañero. No hace falta escribir perfecto: entiende
errores de tipeo y frases sin tildes.

Ejemplos que funcionan bien:

- "¿Cómo andamos en Coquimbo?"
- "¿Qué marca lidera en promotores en Falabella?"
- "Las 5 tiendas más flojas de La Serena"
- "¿Qué tiendas bajaron desde el último corte?"
- "¿Cómo ha evolucionado el share de muebles?"
- "¿En qué ciudad está mejor Honor?"
- "¿Cómo va la 279898?" (sirve el código completo o solo el número)
- "¿Qué tiendas no tienen levantamiento de promotores?"

Cada respuesta trae "Cómo lo entendí", que muestra qué entendió el asistente. Si no está seguro, te lo dice y te
sugiere preguntas en vez de inventar. Las preguntas sugeridas bajo la respuesta sirven para seguir la conversación.

Si el agente con Groq está activo, aparece el selector "Responde":

- **Automático:** responde el modelo propio y, si no entiende, Groq analiza la pregunta.
- **Solo modelo propio:** nunca consulta a Groq.
- **Groq:** sirve para preguntas abiertas, como "¿dónde debería enfocar el trabajo esta semana?". Tarda unos segundos
  porque consulta los datos varias veces antes de responder. Su respuesta lleva la marca "Análisis generado por IA", y
  en "Cómo lo razonó" se ven las consultas que hizo y si sus cifras se pudieron verificar.

## Celular

En el celular la navegación pasa a una barra abajo (Display, Historial, Bitácora, Éxito Entel y Asistente). El
círculo con tus iniciales abre el panel de cuenta, donde cambias el tema y cierras sesión.

## Preguntas frecuentes

**No veo la pestaña Admin.** Tu usuario no tiene rol admin. Pídeselo a quien administra la app.

**Subí el Excel y aparece un error.** El mensaje dice qué hoja o qué celda revisar. Los errores bloquean la
publicación; los avisos (en amarillo) no.

**Un número del asistente no me cuadra con el Display.** Revisa los filtros: el asistente usa los que entendió de tu
pregunta, y se ven en "Cómo lo entendí". Si no le diste métrica, usa exhibiciones.

**Me apareció "X guardó esta tienda mientras la llenabas".** Otra persona envió la Foto del Éxito de esa misma tienda
y semana mientras tú la llenabas. La app no reemplaza lo suyo sin preguntarte: con "Recargar con su versión" ves lo
que guardó (lo que marcaste se pierde) y con "Guardar igual con lo mío" la reemplazas. Si no estás seguro, recarga y
revisa.

**Al publicar me dice que otra persona acaba de publicar esa fecha.** Otro admin subió un corte con la misma fecha
después de que abriste Admin. Si confirmas, tu Excel lo reemplaza; si no, no se publica nada.

**¿Mis preguntas al asistente salen de la app?** Con el modelo propio, no: todo corre en tu navegador. Con el agente
de Groq, sí: la pregunta y los datos que consulta se envían a Groq.
