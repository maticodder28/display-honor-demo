import { expect, test } from '@playwright/test';

test('en el celular la navegación pasa a la barra inferior', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('note')).toContainText('números ficticios');
  await page.getByRole('link', { name: 'Historial' }).last().click();
  await expect(page).toHaveURL(/\/historial$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Historial y evolución');
});

test('el panel de cuenta se abre y se cierra con Escape', async ({ page }) => {
  await page.goto('/');
  const cuenta = page.getByRole('button', { name: /Cuenta y opciones/ });
  await cuenta.click();
  await expect(cuenta).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(cuenta).toHaveAttribute('aria-expanded', 'false');
});
