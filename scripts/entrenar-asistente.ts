/**
 * Entrena el clasificador de intencion del asistente.
 * Uso: npm run asistente:entrenar
 *
 * 1. Genera preguntas de entrenamiento a partir de plantillas (con sinonimos, rellenos y errores de tipeo).
 * 2. Las pasa por el mismo extractor de entidades que usa la app, para entrenar con lo que el modelo vera.
 * 3. Separa 80/20, entrena una regresion logistica multinomial (descenso de gradiente con L2) y mide.
 * 4. Evalua ademas con preguntas escritas a mano (src/lib/asistente/evaluacion.ts), que no salen de las plantillas.
 * 5. Guarda el modelo en src/lib/asistente/modelo.json y el reporte en docs/asistente-evaluacion.md.
 */
import { writeFileSync } from 'node:fs';
import { UMBRAL, caracteristicas, indexador, puntajes, softmax, vectorizar, type Modelo } from '../src/dominio/asistente/clasificador';
import { extraer, type Catalogo } from '../src/dominio/asistente/entidades';
import { PREGUNTAS_EVALUACION } from '../src/dominio/asistente/evaluacion';
import { INTENCIONES, type Intencion } from '../src/dominio/asistente/intenciones';
import { MARCAS_DEMO, historialDemo, tiendasDemo } from '../src/infraestructura/demo/datos';
import { crearMotor } from '../src/dominio/asistente/motor';

// ---------------------------------------------------------------------
// Azar con semilla, para que el entrenamiento sea reproducible
// ---------------------------------------------------------------------
let semilla = 20261119;
const azar = () => { semilla = (semilla * 1664525 + 1013904223) >>> 0; return semilla / 4294967296; };
const elegir = <T,>(l: readonly T[]) => l[Math.floor(azar() * l.length)];

const catalogo: Catalogo = { tiendas: tiendasDemo(), marcas: MARCAS_DEMO };
const ciudades = [...new Set(catalogo.tiendas.map((t) => t.ciudad))];
const clientes = [...new Set(catalogo.tiendas.map((t) => t.cliente))];

const SLOTS: Record<string, () => string> = {
  met: () => elegir(['exhibiciones', 'exhibición', 'equipos exhibidos', 'muebles', 'muebles DC', 'display zone', 'promotores', 'vendedores', 'exhibicion']),
  ciu: () => elegir(ciudades),
  cli: () => elegir(clientes),
  mar: () => elegir(MARCAS_DEMO.filter((m) => m !== 'Honor')),
  // Codigo o nombre de tienda. Si el nombre es solo cadena + ciudad, se antepone "tienda" para que el extractor
  // lo reconozca como tienda (sin eso se leeria como filtro de cadena y ciudad, y ensuciaria el entrenamiento).
  tie: () => {
    const t = elegir(catalogo.tiendas.filter((x) => x.cobertura !== 'Cerrada'));
    if (azar() < 0.5) return t.codigo;
    const nombre = t.tienda.toLowerCase();
    return extraer(nombre, catalogo).entidades.tienda ? nombre : `tienda ${nombre}`;
  },
  n: () => elegir(['3', '5', '10', 'tres', 'cinco', 'diez']),
  cob: () => elegir(['cobertura promotor', 'middle management', 'middle', 'sin cobertura', 'MM']),
  // Filtro opcional: lugar, cadena o cobertura.
  fil: () => elegir(['', '', '', 'en <ciu>', 'en <cli>', 'en <cli> <ciu>', 'en las tiendas <cob>', 'en <ciu> para <met>', 'de <cli>']),
};

/** Expande "{a|b|c}" eligiendo una opcion y reemplaza los <slots>. */
function expandir(p: string): string {
  let s = p;
  for (let k = 0; k < 6 && /[{<]/.test(s); k++) {
    s = s.replace(/\{([^{}]*)\}/g, (_, ops: string) => elegir(ops.split('|')));
    s = s.replace(/<(\w+)>/g, (_, n: string) => (SLOTS[n] ? SLOTS[n]() : n));
  }
  return s.replace(/\s+/g, ' ').trim();
}

const PRE = '{||||oye |hola, |me puedes decir |quiero saber |necesito saber |dime |una consulta: |}';
const POST = '{||||?| por favor| porfa|?|}';

const PLANTILLAS: Record<Intencion, string[]> = {
  resumen: [
    '{cuál es|cuanto es|qué} {el share|la participación|el porcentaje} de {honor|nosotros} {en <met>|} <fil>',
    '{cómo|como} {vamos|estamos|va honor|anda honor} {en <met>|con <met>|} <fil>',
    'share de {honor|} {en <met>|<met>} <fil>',
    '{cuánto|qué} {share|porcentaje|participación} {tenemos|tiene honor} <fil>',
    '{cómo|como} {estamos|está honor|va honor} {frente a|contra|versus|vs|comparado con} <mar> <fil>',
    'honor {vs|contra|frente a} <mar> {en <met>|} <fil>',
    '{resumen|situación|estado} de {honor|la marca} <fil>',
    '{cuántos|cuantos} <met> tiene honor <fil>',
    'participación de honor en <met> <fil>',
    '{qué tal|cómo} {nos va|le va a honor} <fil>',
    '{dame|muéstrame} el share de <met> <fil>',
    '{cuál es nuestra|cuál es la} situación en <ciu>',
    'porcentaje de <met> de honor <fil>',
  ],
  lider: [
    '{quién|quien|qué marca|que marca|cuál marca} {lidera|domina|manda|va primero|está primera|tiene más} {en <met>|} <fil>',
    '{cuál es|quién es} {la marca líder|el líder|el lider|la primera marca} {en <met>|} <fil>',
    '{qué|cuál} marca tiene {más|mayor} {<met>|share|participación} <fil>',
    '{quién|qué marca} {está|va} {primero|en primer lugar|arriba} <fil>',
    '{ranking|orden|posiciones} de {marcas|las marcas} {en <met>|} <fil>',
    '{en qué|en que} {lugar|puesto|posición} está honor <fil>',
    '{qué|que} puesto {tiene|ocupa} honor {en <met>|} <fil>',
    '{cómo|como} {van|están} las marcas <fil>',
    '{quién|quien} nos gana {en <met>|} <fil>',
    'marca con {más|mayor} {exhibición|presencia|equipos} <fil>',
  ],
  ranking_tiendas: [
    '{en qué|en que|cuáles son las|cuales son las} {<n>|} tiendas {honor|} {está|esta|estamos|tiene} {más débil|peor|más fuerte|mejor|menos share|más share|menor share|mayor share} <fil>',
    '{tiendas|las tiendas} con {menor|mayor|más|menos|peor|mejor} {share|participación|porcentaje} {de <met>|} <fil>',
    '{top|ranking de|las <n> mejores|las <n> peores|las peores|las mejores} tiendas {de honor|para honor|} <fil>',
    '{dónde|donde} {estamos|está honor} {peor|mejor|más débiles|más fuertes} <fil>',
    '{en qué|en cuáles|en cuales} tiendas {lideramos|lidera honor|no lideramos|perdemos|ganamos|estamos primeros} <fil>',
    '{muéstrame|dame|lista de} {las|} tiendas {más|menos} {fuertes|débiles|flojas|rezagadas} <fil>',
    '{cuáles|cuales} son las tiendas {donde honor tiene|con} {más|menos} <met> <fil>',
    '{ordena|ordenar} las tiendas por share {de <met>|} <fil>',
    '<n> tiendas con {peor|mejor} share <fil>',
    '{tiendas|locales|puntos de venta} {críticos|críticas|prioritarias|donde reforzar} <fil>',
  ],
  tendencia: [
    '{cómo|como} {ha evolucionado|evolucionó|ha cambiado|cambió|se ha movido} {el share|honor|la participación} {de <met>|} <fil>',
    '{evolución|tendencia|historia|histórico|historico} {del share|de honor|de <met>} <fil>',
    '{ha subido|subió|bajó|ha bajado|creció|cayó} {honor|el share|la participación} {en el tiempo|últimamente|en los últimos cortes|} <fil>',
    '{cómo|como} {venimos|ha ido honor|nos ha ido} {en los últimos cortes|en el tiempo|últimamente|este último tiempo} <fil>',
    '{share|participación} {en el tiempo|por corte|corte a corte|mes a mes|semana a semana} <fil>',
    '{estamos|vamos} {mejorando|empeorando|creciendo|cayendo} {en <met>|} <fil>',
    '{comparación|diferencia} {con el primer corte|desde el primer corte|entre el primer y el último corte} <fil>',
    '{gráfico|grafico|curva} {de evolución|del share|de tendencia} <fil>',
    '{cuánto|cuanto} {hemos crecido|ha crecido honor|hemos subido} {desde el inicio|desde el primer corte|} <fil>',
  ],
  cambios_tiendas: [
    '{qué|que|cuáles|cuales} tiendas {bajaron|subieron|empeoraron|mejoraron|cambiaron|cayeron} {desde el último corte|desde el corte anterior|respecto al corte anterior|vs el corte anterior|} <fil>',
    '{dónde|donde|en qué tiendas} {bajamos|subimos|empeoramos|mejoramos|perdimos share|ganamos share} {desde el corte anterior|en el último corte|este corte|} <fil>',
    '{cambios|variación|diferencias} {por tienda|tienda por tienda|en las tiendas} {desde el corte anterior|entre los dos últimos cortes|} <fil>',
    '{compara|comparar|comparación de} {el último corte con el anterior|los dos últimos cortes|este corte con el anterior} <fil>',
    '{tiendas|locales} que {bajaron|subieron|perdieron|ganaron} {share|participación|puntos} <fil>',
    '{qué|que} {cambió|cambio|se movió} en las tiendas <fil>',
    '{cuántas|cuantas} tiendas {mejoraron|empeoraron|bajaron|subieron} <fil>',
    '{mayores|principales|las} {caídas|bajas|subidas|alzas|mejoras} {por tienda|de tiendas|} <fil>',
  ],
  por_grupo: [
    '{en qué|en que|en cuál|en cual} {ciudad|cliente|cadena|cobertura} {está mejor|está peor|va mejor|va peor|tenemos más share|tenemos menos share} honor {en <met>|}',
    '{share|participación} {por ciudad|por cliente|por cadena|por cobertura|de cada ciudad|de cada cliente|de cada cadena} {de <met>|}',
    '{compara|comparar|comparación de|compárame} {las ciudades|los clientes|las cadenas|las coberturas}',
    '{cómo|como} {estamos|va honor|nos va} {en cada ciudad|en cada cliente|en cada cadena|por ciudad|por cliente}',
    '{cuál|qué} {ciudad|cliente|cadena} {es la mejor|es la peor|es más fuerte|es más débil} {para honor|}',
    '{ranking|orden} de {ciudades|clientes|cadenas}',
    '{qué|cuál} {ciudad|cadena|cliente} {necesita más trabajo|hay que reforzar|está más floja}',
    '{distribución|desglose} {por ciudad|por cliente|por cadena|por cobertura}',
    '{promotor o middle|promotor vs middle|cobertura promotor vs middle management} {dónde estamos mejor|cuál va mejor|}',
  ],
  detalle_tienda: [
    '{cómo|como} {está|va|anda|esta} {la tienda|la sucursal|el local|} <tie>',
    '{datos|información|info|detalle|resumen|situación} de {la tienda|} <tie>',
    '{qué|que} pasa en <tie>',
    '<tie>',
    '{muéstrame|dame|ver} <tie>',
    '{share|participación} de {honor|} en {la tienda|} <tie>',
    '{quién|quien} lidera en {la tienda|} <tie>',
    '{cómo|como} le fue a <tie> {en el último corte|}',
    '{y|} {qué tal|cómo va} <tie>',
  ],
  sin_levantamiento: [
    '{qué|que|cuáles|cuales} tiendas {no tienen|están sin|faltan de|quedaron sin} {levantamiento|medición|datos|registro} {de <met>|} <fil>',
    '{tiendas|locales} sin {levantamiento|medir|medición|datos} <fil>',
    '{dónde|donde|en qué tiendas} {falta|faltan|no hay} {levantamiento|datos|mediciones|medición} <fil>',
    '{cuántas|cuantas} tiendas {se midieron|tienen levantamiento|faltan por medir|no se midieron} <fil>',
    '{qué|que} {tiendas|locales} {no se midieron|no medimos|quedaron pendientes|faltan por visitar} <fil>',
    '{cobertura|avance} {del levantamiento|de medición}',
  ],
  ayuda: [
    '{hola|buenas|buenos días|buenas tardes|hey|hola hola}',
    '{qué|que} {puedes hacer|sabes hacer|te puedo preguntar|preguntas puedo hacer}',
    '{ayuda|help|ayúdame|instrucciones|cómo funciona|como funciona esto}',
    '{cómo|como} {te uso|se usa esto|funcionas}',
    '{quién eres|qué eres|para qué sirves}',
    '{gracias|muchas gracias|ok gracias|perfecto gracias}',
    '{dame|muéstrame} {ejemplos|algunos ejemplos} de preguntas',
  ],
  fuera: [
    '{qué hora es|qué día es hoy|qué fecha es}',
    '{cómo|como} {estará|está} el clima {mañana|hoy|} {en santiago|en la playa|}',
    '{cuéntame|dime} un chiste',
    '{quién ganó|quien gano} el partido {de ayer|}',
    '{escribe|redacta} un {correo|mail|poema|cuento} {para mi jefe|}',
    '{cuál es|cual es} la capital de {francia|chile|perú}',
    '{recomiéndame|recomiendame} {una película|un restaurante|una serie|música}',
    '{cuánto|cuanto} {está|vale} el dólar {hoy|}',
    '{traduce|traducir} esto al {inglés|francés}',
    '{cómo|como} {hago|preparo} {un queque|pan|una torta}',
    '{precio|cuánto cuesta} {el|un} {iphone|celular|samsung galaxy}',
    '{qué|que} es {la inteligencia artificial|python|un algoritmo}',
    '{abre|abrir} {el excel|la bitácora|whatsapp}',
    '{mándale|envía} un mensaje a {mi supervisor|carlos}',
    'asdf {qwer|zxcv|}',
    '{va a|irá a|va} {llover|hacer frío|hacer calor} {mañana|el fin de semana|hoy|}',
    '{quién|quien} {inventó|invento|descubrió|escribió|pintó} {el teléfono|la radio|américa|el quijote|la mona lisa}',
    '{resumen|resultado|marcador} del partido de {colo colo|la u|chile|la selección}',
    '{cuál|qué} {celular|teléfono|notebook|tablet} {me conviene|es el mejor para comprar|compro}',
    '{cuándo|cuando} {es|cae} {el feriado|navidad|el 18|mi cumpleaños}',
    '{haz|hazme|escribe|escríbeme} {un resumen de esta noticia|una carta|un mensaje para pedir vacaciones|una canción}',
    '{cómo|como} {llego|voy} {al mall|a santiago|al aeropuerto}',
    '{cuál es|cual es} {tu color favorito|el sentido de la vida|la mejor película}',
  ],
};

// ---------------------------------------------------------------------
// Datos
// ---------------------------------------------------------------------
/** Error de tipeo: borra, duplica o cambia de lugar una letra de una palabra larga. */
function tipeo(s: string): string {
  const ps = s.split(' ');
  const i = Math.floor(azar() * ps.length);
  const w = ps[i];
  if (w.length < 6) return s;
  const j = 1 + Math.floor(azar() * (w.length - 2));
  const op = azar();
  ps[i] = op < 0.4 ? w.slice(0, j) + w.slice(j + 1) : op < 0.7 ? w.slice(0, j) + w[j] + w.slice(j) : w.slice(0, j) + w[j + 1] + w[j] + w.slice(j + 2);
  return ps.join(' ');
}

type Ejemplo = { texto: string; clase: Intencion };
const POR_PLANTILLA = 22;
const ejemplos: Ejemplo[] = [];
for (const [clase, plantillas] of Object.entries(PLANTILLAS) as [Intencion, string[]][]) {
  const vistos = new Set<string>();
  for (const p of plantillas)
    for (let k = 0; k < POR_PLANTILLA; k++) {
      let texto = expandir(`${PRE}${p}${POST}`);
      if (azar() < 0.15) texto = tipeo(texto);
      if (azar() < 0.3) texto = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (!vistos.has(texto)) { vistos.add(texto); ejemplos.push({ texto, clase }); }
    }
}
// Mezcla y separa 80/20.
for (let i = ejemplos.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [ejemplos[i], ejemplos[j]] = [ejemplos[j], ejemplos[i]]; }
const corte = Math.floor(ejemplos.length * 0.8);
const entreno = ejemplos.slice(0, corte);
const prueba = ejemplos.slice(corte);

const feats = (texto: string) => caracteristicas(extraer(texto, catalogo).plantilla);

// Vocabulario: caracteristicas que aparecen en al menos 2 ejemplos de entrenamiento.
const df = new Map<string, number>();
const featsEntreno = entreno.map((e) => feats(e.texto));
for (const f of featsEntreno) for (const x of new Set(f)) df.set(x, (df.get(x) ?? 0) + 1);
const vocabulario = [...df.entries()].filter(([, n]) => n >= 2).map(([v]) => v).sort();
const N = entreno.length;
const idf = vocabulario.map((v) => Math.log((1 + N) / (1 + df.get(v)!)) + 1);
const indexar = indexador(vocabulario);
const clases = Object.keys(PLANTILLAS) as Intencion[];
const X = featsEntreno.map((f) => vectorizar(indexar(f), idf));
const Y = entreno.map((e) => clases.indexOf(e.clase));

// ---------------------------------------------------------------------
// Entrenamiento: regresion logistica multinomial con descenso de gradiente (Adam) y L2
// ---------------------------------------------------------------------
const C = clases.length, F = vocabulario.length;
const W = Array.from({ length: C }, () => new Float64Array(F));
const b = new Float64Array(C);
const mW = Array.from({ length: C }, () => new Float64Array(F)), vW = Array.from({ length: C }, () => new Float64Array(F));
const mb = new Float64Array(C), vb = new Float64Array(C);
const LR = 0.05, L2 = 1e-5, EPOCAS = 600, B1 = 0.9, B2 = 0.999;
for (let ep = 1; ep <= EPOCAS; ep++) {
  const gW = Array.from({ length: C }, () => new Float64Array(F));
  const gb = new Float64Array(C);
  let perdida = 0;
  for (let n = 0; n < X.length; n++) {
    const p = softmax(puntajes(X[n], W as unknown as number[][], Array.from(b)));
    perdida -= Math.log(p[Y[n]] + 1e-12);
    for (let c = 0; c < C; c++) {
      const err = p[c] - (c === Y[n] ? 1 : 0);
      gb[c] += err;
      X[n].forEach((x, i) => { gW[c][i] += err * x; });
    }
  }
  for (let c = 0; c < C; c++) {
    for (let i = 0; i < F; i++) {
      const g = gW[c][i] / X.length + L2 * W[c][i];
      mW[c][i] = B1 * mW[c][i] + (1 - B1) * g; vW[c][i] = B2 * vW[c][i] + (1 - B2) * g * g;
      W[c][i] -= (LR * (mW[c][i] / (1 - B1 ** ep))) / (Math.sqrt(vW[c][i] / (1 - B2 ** ep)) + 1e-8);
    }
    const g = gb[c] / X.length;
    mb[c] = B1 * mb[c] + (1 - B1) * g; vb[c] = B2 * vb[c] + (1 - B2) * g * g;
    b[c] -= (LR * (mb[c] / (1 - B1 ** ep))) / (Math.sqrt(vb[c] / (1 - B2 ** ep)) + 1e-8);
  }
  if (ep % 50 === 0) console.log(`epoca ${ep}: perdida ${(perdida / X.length).toFixed(4)}`);
}

const redondear = (x: number) => Math.round(x * 1000) / 1000;
const modelo: Modelo = {
  version: 1,
  clases,
  vocabulario,
  idf: idf.map(redondear),
  pesos: W.map((w) => Array.from(w, redondear)),
  sesgo: Array.from(b, redondear),
};

// ---------------------------------------------------------------------
// Evaluacion
// ---------------------------------------------------------------------
function predecir(texto: string) {
  const v = vectorizar(indexar(feats(texto)), modelo.idf);
  const p = softmax(puntajes(v, modelo.pesos, modelo.sesgo));
  const i = p.indexOf(Math.max(...p));
  // Bajo el umbral, el asistente responde que no esta seguro: cuenta como 'fuera'.
  return { clase: p[i] < UMBRAL ? 'fuera' : clases[i], p: p[i] };
}

function medir(conjunto: { texto: string; clase: Intencion }[]) {
  const matriz = clases.map(() => clases.map(() => 0));
  const errores: string[] = [];
  for (const e of conjunto) {
    const r = predecir(e.texto);
    matriz[clases.indexOf(e.clase)][clases.indexOf(r.clase)]++;
    if (r.clase !== e.clase) errores.push(`"${e.texto}": esperaba ${e.clase}, predijo ${r.clase} (${Math.round(r.p * 100)}%)`);
  }
  const porClase = clases.map((c, i) => {
    const tp = matriz[i][i];
    const fp = matriz.reduce((s, f, j) => s + (j === i ? 0 : f[i]), 0);
    const fn = matriz[i].reduce((s, x, j) => s + (j === i ? 0 : x), 0);
    const prec = tp + fp ? tp / (tp + fp) : 0, rec = tp + fn ? tp / (tp + fn) : 0;
    return { c, n: tp + fn, prec, rec, f1: prec + rec ? (2 * prec * rec) / (prec + rec) : 0 };
  });
  const exactitud = conjunto.length ? matriz.reduce((s, f, i) => s + f[i], 0) / conjunto.length : 0;
  return { exactitud, porClase, errores, matriz };
}

const rPrueba = medir(prueba);
const rMano = medir(PREGUNTAS_EVALUACION.map((p) => ({ texto: p.pregunta, clase: p.intencion })));
// Motor completo: clasificador + reglas (saludos, tienda nombrada, comparacion entre grupos, umbral).
const motor = crearMotor(modelo, historialDemo());
const erroresMotor: string[] = [];
const aciertosMotor = PREGUNTAS_EVALUACION.filter((p) => {
  const r = motor(p.pregunta);
  if (r.intencion !== p.intencion) erroresMotor.push(`"${p.pregunta}": esperaba ${p.intencion}, respondió ${r.intencion}${r.regla ? ` (regla: ${r.regla})` : ''}`);
  return r.intencion === p.intencion;
}).length;
const exMotor = aciertosMotor / PREGUNTAS_EVALUACION.length;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`Ejemplos: ${ejemplos.length} (entrenamiento ${entreno.length}, prueba ${prueba.length}); vocabulario ${F}`);
console.log(`Exactitud en prueba (plantillas): ${pct(rPrueba.exactitud)}`);
console.log(`Exactitud en preguntas escritas a mano: ${pct(rMano.exactitud)} (${PREGUNTAS_EVALUACION.length} preguntas)`);
rMano.errores.forEach((e) => console.log('  - ' + e));
console.log(`Motor completo (clasificador + reglas): ${pct(exMotor)}`);
erroresMotor.forEach((e) => console.log('  * ' + e));

writeFileSync(new URL('../src/lib/asistente/modelo.json', import.meta.url), JSON.stringify(modelo));

const tabla = (r: ReturnType<typeof medir>) => [
  '| Intención | Preguntas | Precisión | Recall | F1 |',
  '|---|---:|---:|---:|---:|',
  ...r.porClase.map((x) => `| ${INTENCIONES[x.c as Intencion].nombre} (\`${x.c}\`) | ${x.n} | ${pct(x.prec)} | ${pct(x.rec)} | ${pct(x.f1)} |`),
].join('\n');
const matrizMd = (r: ReturnType<typeof medir>) => [
  `| real \\ predicha | ${clases.map((c) => `\`${c}\``).join(' | ')} |`,
  `|---|${clases.map(() => '---:').join('|')}|`,
  ...r.matriz.map((f, i) => `| \`${clases[i]}\` | ${f.map((x, j) => (i === j ? `**${x}**` : x || '.')).join(' | ')} |`),
].join('\n');

writeFileSync(new URL('../docs/asistente-evaluacion.md', import.meta.url), `# Evaluación del clasificador de intención

Generado por \`npm run asistente:entrenar\` (scripts/entrenar-asistente.ts). No editar a mano.

## Datos y modelo

- **Datos de entrenamiento:** ${ejemplos.length} preguntas generadas desde ${Object.values(PLANTILLAS).flat().length} plantillas,
  con sinónimos, rellenos ("oye", "por favor"), preguntas sin tildes (30 %) y errores de tipeo (15 %).
  Separadas al azar en ${entreno.length} de entrenamiento y ${prueba.length} de prueba.
- **Representación:** la pregunta pasa por el extractor de entidades, que reemplaza tiendas, ciudades, clientes, marcas
  y métricas por marcadores (\`_ciudad_\`, \`_metrica_\`...). Luego TF-IDF sobre raíces de 5 letras y pares de raíces
  consecutivas: ${F} características.
- **Modelo:** regresión logística multinomial, ${EPOCAS} épocas de Adam (tasa ${LR}) con regularización L2 (${L2}).
  Las palabras desconocidas se corrigen a la del vocabulario más cercana (distancia de edición 1).
- **Umbral de confianza:** si la intención más probable no supera ${UMBRAL * 100} %, el asistente responde que no está
  seguro y sugiere preguntas, en vez de adivinar. En esta evaluación eso cuenta como "fuera de alcance".

## Resultados

| Conjunto | Preguntas | Exactitud |
|---|---:|---:|
| Prueba (generadas, no vistas al entrenar) | ${prueba.length} | ${pct(rPrueba.exactitud)} |
| Escritas a mano, solo clasificador | ${PREGUNTAS_EVALUACION.length} | ${pct(rMano.exactitud)} |
| **Escritas a mano, motor completo** (clasificador + reglas) | ${PREGUNTAS_EVALUACION.length} | **${pct(exMotor)}** |

Las preguntas generadas se parecen a las de entrenamiento, así que su exactitud es optimista. Las escritas a mano
miden cómo responde ante formas de preguntar que el modelo no vio; la última fila es lo que vive el usuario, porque el
motor suma reglas simples al clasificador: un saludo solo va a Ayuda, nombrar una tienda lleva a su detalle, y pedir
algo "por ciudad" o nombrar varios clientes lleva a la comparación entre grupos.

**Cómo se llegó a estas cifras.** La primera medición, con 250 épocas y L2 = 1e-4, dio 90,7 % con las preguntas a mano.
Después se agregaron categorías fuera de tema (clima, deportes, compras, cultura general), se reconocieron códigos con
espacio ("dm 101") y se compararon tres configuraciones de entrenamiento. Como esa comparación miró este mismo conjunto,
la cifra es algo optimista: para medir sin sesgo haría falta un tercer conjunto de preguntas nuevas.

### Por intención (preguntas escritas a mano)

${tabla(rMano)}

### Matriz de confusión (preguntas escritas a mano)

${matrizMd(rMano)}

${erroresMotor.length ? `### Errores del motor completo\n\n${erroresMotor.map((e) => `- ${e}`).join('\n')}\n` : ''}`);
