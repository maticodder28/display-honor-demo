import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PAGINAS = [
  ['Display', '/'],
  ['Historial', '/historial'],
  ['Bitácora', '/bitacora'],
  ['Foto del Éxito', '/foto'],
  ['Admin', '/admin'],
  ['Asistente', '/asistente'],
] as const;

for (const tema of ['oscuro', 'claro'] as const) {
  for (const [nombre, ruta] of PAGINAS) {
    test(`${nombre} (tema ${tema}) no tiene problemas de accesibilidad graves`, async ({ page }) => {
      if (tema === 'claro') await page.addInitScript(() => localStorage.setItem('tema', 'light'));
      await page.goto(ruta);
      await expect(page.locator('main')).toBeVisible();
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const graves = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      expect(graves.map((v) => `${v.id}: ${v.help} (${v.nodes.length} elementos)`)).toEqual([]);
    });
  }
}
