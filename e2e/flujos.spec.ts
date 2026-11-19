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

test.describe('Asistente con respaldo LLM', () => {
  test('consulta a Groq solo cuando el modelo propio no está seguro', async ({ page }) => {
    let consultas = 0;
    await page.route('/api/asistente', async (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { disponible: true, modelo: 'modelo-de-prueba' } });
      consultas++;
      const pregunta = route.request().postDataJSON().pregunta;
      // Respuesta armada como la devolveria el servidor tras ejecutar la herramienta elegida.
      return route.fulfill({ json: { resultado: {
        pregunta, intencion: 'tendencia', confianza: 1, alternativas: [], regla: null, origen: 'Groq (modelo-de-prueba)',
        entidades: { metrica: null, ciudad: null, cliente: null, cobertura: null, marca: null, tienda: null, tiendasPosibles: [], n: null, direccion: null },
        respuesta: { texto: 'Respuesta calculada por la herramienta de tendencia.', sugerencias: [] },
      } } });
    });
    await page.goto('/asistente');
    await expect(page.getByText(/Respaldo con LLM activo/)).toBeVisible();

    // Una pregunta clara la responde el modelo propio, sin llamar al LLM.
    await page.getByLabel('Tu pregunta').fill('como andamos en coquimbo');
    await page.keyboard.press('Enter');
    await expect(page.locator('.as-resp').last()).toContainText('En Coquimbo, Honor tiene');
    expect(consultas).toBe(0);

    // Una pregunta ambigua pasa al respaldo.
    await page.getByLabel('Tu pregunta').fill('que opinas del panorama');
    await page.keyboard.press('Enter');
    const ultima = page.locator('.as-resp').last();
    await expect(ultima).toContainText('Respuesta calculada por la herramienta de tendencia.');
    await ultima.getByText('Cómo lo entendí').click();
    await expect(ultima).toContainText('Groq (modelo-de-prueba)');
    expect(consultas).toBe(1);
  });

  test('en modo Groq todas las preguntas van a Groq', async ({ page }) => {
    let consultas = 0;
    await page.route('/api/asistente', async (route) => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { disponible: true, modelo: 'modelo-de-prueba' } });
      consultas++;
      return route.fulfill({ json: { resultado: {
        pregunta: route.request().postDataJSON().pregunta, intencion: 'resumen', confianza: 1, alternativas: [], regla: null, origen: 'Groq (modelo-de-prueba)',
        entidades: { metrica: null, ciudad: 'Coquimbo', cliente: null, cobertura: null, marca: null, tienda: null, tiendasPosibles: [], n: null, direccion: null },
        respuesta: { texto: 'Respuesta elegida por Groq.', sugerencias: [] },
      } } });
    });
    await page.goto('/asistente');
    await page.getByRole('button', { name: 'Groq', exact: true }).click();
    await page.getByLabel('Tu pregunta').fill('como andamos en coquimbo');
    await page.keyboard.press('Enter');
    await expect(page.locator('.as-resp').last()).toContainText('Respuesta elegida por Groq.');
    expect(consultas).toBe(1);

    await page.getByRole('button', { name: 'Solo modelo propio' }).click();
    await page.getByLabel('Tu pregunta').fill('que opinas del panorama');
    await page.keyboard.press('Enter');
    await expect(page.locator('.as-resp').last()).toContainText('No estoy seguro de entender');
    expect(consultas).toBe(1);
  });

  test('sin clave configurada todo funciona con el modelo propio', async ({ page }) => {
    await page.goto('/asistente');
    await expect(page.getByText(/Respaldo con LLM desactivado/)).toBeVisible();
    await page.getByLabel('Tu pregunta').fill('que opinas del panorama');
    await page.keyboard.press('Enter');
    await expect(page.locator('.as-resp').last()).toContainText('No estoy seguro de entender');
  });
});
