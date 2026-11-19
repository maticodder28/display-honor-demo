import { expect, test } from '@playwright/test';

test.describe('Display', () => {
  test('muestra el resumen de la zona y el aviso de demo', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Zona Norte');
    await expect(page.getByRole('note')).toContainText('datos ficticios');
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
