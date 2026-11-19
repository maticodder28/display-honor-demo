// Falla si algun archivo de texto del repo tiene caracteres fuera de ASCII, salvo tildes, ñ, ü, ¿ y ¡.
// Regla del proyecto: sin simbolos tipograficos, caracteres invisibles ni marcas Unicode.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PERMITIDOS = new Set('áéíóúÁÉÍÓÚñÑüÜ¿¡');
const IGNORAR = new Set(['.git', 'node_modules', '.next', 'test-results', 'playwright-report']);
const BINARIOS = /\.(png|jpe?g|gif|webp|ico|xlsx|woff2?)$/i;
const problemas = [];

function revisar(dir) {
  for (const nombre of readdirSync(dir)) {
    if (IGNORAR.has(nombre)) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) { revisar(ruta); continue; }
    if (BINARIOS.test(nombre)) continue;
    readFileSync(ruta, 'utf8').split('\n').forEach((linea, i) => {
      for (const c of linea)
        if (c.codePointAt(0) > 127 && !PERMITIDOS.has(c))
          problemas.push(`${ruta}:${i + 1}  U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
    });
  }
}

revisar('.');
if (problemas.length) {
  console.error(`Caracteres no permitidos (${problemas.length}):\n${problemas.slice(0, 50).join('\n')}`);
  process.exit(1);
}
console.log('Unicode OK: solo ASCII y tildes.');
