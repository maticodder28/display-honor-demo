import { expect, test } from '@playwright/test';

test.describe('Display', () => {
  test('muestra el resumen de la zona y el aviso de demo', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Zona Norte');
    await expect(page.getByRole('note')).toContainText('números ficticios');
    await expect(page.getByText(/del share de exhibiciones/)).toBeVisible();
  });

  test('los filtros cambian el alcance del resumen', async ({ page }) => {
    await page.goto('/');
    const resumen = page.getByText(/del share de exhibiciones/);
    await page.getByLabel('Ciudad').selectOption('Ovalle');
    await expect(resumen).toContainText('Ovalle');
    await page.getByLabel('Ciudad').selectOption('Todas');
    await expect(resumen).toContainText('Zona Norte');
  });

  test('la tabla de tiendas se ordena y se filtra por texto', async ({ page }) => {
    await page.goto('/');
    const tabla = page.locator('table.det');
    const encabezado = tabla.getByRole('columnheader', { name: 'Tienda' });
    await encabezado.getByRole('button').click();
    await expect(encabezado).toHaveAttribute('aria-sort', /ascending|descending/);

    const total = await tabla.locator('tbody tr').count();
    await page.getByRole('searchbox', { name: 'Buscar tienda' }).fill('DM101');
    await expect(tabla.locator('tbody tr')).toHaveCount(1);
    expect(total).toBeGreaterThan(1);
  });

  test('el tema claro se recuerda al recargar', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Cambiar a tema claro' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});

test.describe('Historial', () => {
  test('compara dos cortes tienda por tienda', async ({ page }) => {
    await page.goto('/historial');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Historial y evolución');
    await expect(page.getByText('Mejoraron').first()).toBeVisible();
    await page.getByRole('button', { name: 'Empeoraron' }).click();
    await expect(page.getByRole('button', { name: 'Empeoraron' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('descarga la comparación en Excel', async ({ page }) => {
    await page.goto('/historial');
    const descarga = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar comparación' }).click();
    expect((await descarga).suggestedFilename()).toMatch(/\.xlsx$/);
  });
});

test.describe('Bitácora', () => {
  test('al guardar en la demo avisa que no se guarda nada', async ({ page }) => {
    await page.goto('/bitacora');
    await page.getByPlaceholder(/Qué se revisó/).fill('Prueba automática');
    await page.getByRole('button', { name: 'Guardar acción' }).click();
    await expect(page.getByText('Modo demo').first()).toBeVisible();
  });

  test('genera el reporte mensual en Excel', async ({ page }) => {
    await page.goto('/bitacora');
    const descarga = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar reporte' }).click();
    expect((await descarga).suggestedFilename()).toMatch(/\.xlsx$/);
  });
});

test.describe('Foto del Éxito', () => {
  test('muestra el cumplimiento por tienda y cambia de vista', async ({ page }) => {
    await page.goto('/foto');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Foto del Éxito');
    await expect(page.getByText('Cumplimiento promedio')).toBeVisible();
    await page.getByRole('tab', { name: 'Productos del mes' }).click();
    await expect(page.getByRole('tab', { name: 'Productos del mes' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(/Un producto oculto deja de pedirse/)).toBeVisible();
  });
});

test.describe('Admin', () => {
  test('el Excel descargado se vuelve a validar y se puede publicar', async ({ page }) => {
    await page.goto('/admin');
    const descarga = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Descargar Excel actual' }).click();
    const archivo = await (await descarga).path();

    await page.locator('input#archivo').setInputFiles(archivo);
    await expect(page.getByText(/Archivo válido\. Share Honor resultante/)).toBeVisible();
    // La fecha propuesta ya existe como corte: la app pide confirmar el reemplazo.
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Publicar datos' }).click();
    await expect(page.getByText('Modo demo').first()).toBeVisible();
  });
});

test.describe('Asistente', () => {
  test('responde una pregunta escrita con errores de tipeo', async ({ page }) => {
    await page.goto('/asistente');
    await page.getByLabel('Tu pregunta').fill('como andamos en ovale');
    await page.getByRole('button', { name: 'Preguntar' }).click();
    const respuesta = page.locator('.as-resp').last();
    await expect(respuesta).toContainText('En Ovalle, Honor tiene');
    await respuesta.getByText('Cómo lo entendí').click();
    await expect(respuesta).toContainText('Share de Honor');
  });

  test('las preguntas sugeridas encadenan la conversación', async ({ page }) => {
    await page.goto('/asistente');
    await page.getByRole('button', { name: /En qué ciudad está mejor Honor/ }).click();
    await expect(page.locator('.as-resp').last().getByRole('columnheader', { name: 'Ciudad' })).toBeVisible();
    await page.locator('.as-sug button').first().click();
    await expect(page.locator('.as-resp')).toHaveCount(2);
  });

  test('dice que no sabe en vez de inventar', async ({ page }) => {
    await page.goto('/asistente');
    await page.getByLabel('Tu pregunta').fill('cual es la capital de francia');
    await page.keyboard.press('Enter');
    await expect(page.locator('.as-resp').last()).toContainText('No estoy seguro de entender');
  });
});

/** Respuesta del agente tal como la devuelve el servidor. */
const analisis = (pregunta: string, texto: string) => ({ resultado: {
  pregunta, intencion: 'analisis', confianza: 1, alternativas: [], regla: null, origen: 'Groq (modelo-de-prueba)',
  entidades: { metrica: null, ciudad: null, cliente: null, cobertura: null, marca: null, tienda: null, tiendasPosibles: [], n: null, direccion: null },
  respuesta: { texto, sugerencias: [] },
  analisis: { pasos: [{ herramienta: 'resumen', filtros: { ciudad: 'La Serena' } }, { herramienta: 'tendencia', filtros: {} }], verificacion: { verificadas: 2, sinVerificar: [] } },
} });

test.describe('Asistente con Groq', () => {
  test('en modo automático Groq solo entra cuando el modelo propio no está seguro', async ({ page }) => {
    let consultas = 0;
    await page.route('/api/asistente', async (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { disponible: true, modelo: 'modelo-de-prueba' } });
      consultas++;
      return route.fulfill({ json: analisis(route.request().postDataJSON().pregunta, 'Honor va bien en general.\n\n- Reforzar La Serena.\n- Revisar Ovalle.') });
    });
    await page.goto('/asistente');
    await page.getByLabel('Tu pregunta').fill('como andamos en coquimbo');
    await page.keyboard.press('Enter');
    await expect(page.locator('.as-resp').last()).toContainText('En Coquimbo, Honor tiene');
    expect(consultas).toBe(0);

    await page.getByLabel('Tu pregunta').fill('que opinas del panorama');
    await page.keyboard.press('Enter');
    const ultima = page.locator('.as-resp').last();
    await expect(ultima).toContainText('Análisis generado por IA');
    await expect(ultima.getByRole('listitem').filter({ hasText: 'Reforzar La Serena.' })).toBeVisible();
    await ultima.getByText('Cómo lo razonó').click();
    await expect(ultima).toContainText('2 consultas');
    await expect(ultima).toContainText('Las 2 cifras de la respuesta aparecen en las consultas.');
    expect(consultas).toBe(1);
  });

  test('en modo Groq todas las preguntas van al agente, con el contexto de la conversación', async ({ page }) => {
    const cuerpos: { pregunta: string; historial: unknown[] }[] = [];
    await page.route('/api/asistente', async (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { disponible: true, modelo: 'modelo-de-prueba' } });
      const body = route.request().postDataJSON();
      cuerpos.push(body);
      return route.fulfill({ json: analisis(body.pregunta, `Análisis de: ${body.pregunta}`) });
    });
    await page.goto('/asistente');
    await page.getByRole('button', { name: 'Groq', exact: true }).click();
    await page.getByLabel('Tu pregunta').fill('como andamos en coquimbo');
    await page.keyboard.press('Enter');
    await expect(page.locator('.as-resp').last()).toContainText('Análisis de: como andamos en coquimbo');
    await page.getByLabel('Tu pregunta').fill('¿y en ovalle?');
    await page.keyboard.press('Enter');
    await expect(page.locator('.as-resp').last()).toContainText('Análisis de: ¿y en ovalle?');
    expect(cuerpos).toHaveLength(2);
    expect(cuerpos[1].historial).toHaveLength(1);

    await page.getByRole('button', { name: 'Solo modelo propio' }).click();
    await page.getByLabel('Tu pregunta').fill('que opinas del panorama');
    await page.keyboard.press('Enter');
    await expect(page.locator('.as-resp').last()).toContainText('No estoy seguro de entender');
    expect(cuerpos).toHaveLength(2);
  });

  test('si Groq falla, responde el modelo propio y lo avisa', async ({ page }) => {
    await page.route('/api/asistente', async (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { disponible: true, modelo: 'modelo-de-prueba' } });
      return route.fulfill({ status: 429, json: { fallo: 'limite' } });
    });
    await page.goto('/asistente');
    await page.getByRole('button', { name: 'Groq', exact: true }).click();
    await page.getByLabel('Tu pregunta').fill('como andamos en coquimbo');
    await page.keyboard.press('Enter');
    const ultima = page.locator('.as-resp').last();
    await expect(ultima).toContainText('límite de uso');
    await expect(ultima).toContainText('En Coquimbo, Honor tiene');
  });

  test('sin clave configurada todo funciona con el modelo propio', async ({ page }) => {
    await page.goto('/asistente');
    await expect(page.getByText(/Groq no está configurado/)).toBeVisible();
    await page.getByLabel('Tu pregunta').fill('que opinas del panorama');
    await page.keyboard.press('Enter');
    await expect(page.locator('.as-resp').last()).toContainText('No estoy seguro de entender');
  });
});
