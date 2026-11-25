import { test, expect } from '@playwright/test';
import { apiFlatten, apiTrade, openApp } from './helpers';

const TICKER = 'V';

test.describe('Portfolio visualisation', () => {
  test.beforeAll(async ({ request }) => {
    await apiFlatten(request, TICKER);
    await apiTrade(request, TICKER, 'buy', 1); // also records a snapshot
  });
  test.afterAll(async ({ request }) => {
    await apiFlatten(request, TICKER);
  });

  test('heatmap shows a cell for a held position', async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId('heatmap')).toBeVisible();
    const cell = page.getByTestId(`heatmap-cell-${TICKER}`);
    await expect(cell).toBeVisible();
    const box = await cell.boundingBox();
    expect(box && box.width > 0 && box.height > 0, 'heatmap cell has a non-empty area').toBeTruthy();
    await expect(page.getByTestId(`position-row-${TICKER}`)).toBeVisible();
  });

  test('P&L chart has data points', async ({ page, request }) => {
    const history = await (await request.get('/api/portfolio/history')).json();
    expect(history.length).toBeGreaterThanOrEqual(1); // startup snapshot + the trade snapshot

    await openApp(page);
    const chart = page.getByTestId('pnl-chart');
    await expect(chart).toBeVisible();
    await expect
      .poll(async () => Number(await chart.getAttribute('data-points')), { message: 'pnl-chart data-points >= 1' })
      .toBeGreaterThanOrEqual(1);
  });
});
