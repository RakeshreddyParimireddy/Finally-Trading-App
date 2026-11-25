import { test, expect } from '@playwright/test';
import { openApp } from './helpers';

test('clicking a watchlist row selects that ticker in the main chart', async ({ page }) => {
  await openApp(page);
  const chart = page.getByTestId('main-chart');
  await expect(chart).toBeVisible();

  for (const t of ['MSFT', 'NVDA', 'TSLA']) {
    await page.getByTestId(`watchlist-row-${t}`).click();
    await expect(chart).toHaveAttribute('data-ticker', t);
  }
});
