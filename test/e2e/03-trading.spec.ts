import { test, expect } from '@playwright/test';
import {
  apiFlatten, apiPortfolio, apiPositionQty, apiTrade, expectHeaderCash, openApp, uiTrade,
} from './helpers';

// A default (always-tracked) ticker that no other spec trades.
const TICKER = 'JPM';

test.describe('Trading', () => {
  test.beforeEach(async ({ request }) => {
    await apiFlatten(request, TICKER);
  });
  test.afterAll(async ({ request }) => {
    await apiFlatten(request, TICKER);
  });

  test('buy shares: cash drops and a position row appears', async ({ page, request }) => {
    await openApp(page);
    await expect(page.getByTestId(`position-row-${TICKER}`)).toHaveCount(0);

    const before = await apiPortfolio(request);
    await expectHeaderCash(page, before.cash_balance);

    await uiTrade(page, TICKER, 'buy', 2);

    const row = page.getByTestId(`position-row-${TICKER}`);
    await expect(row).toBeVisible();
    await expect(page.getByTestId('positions-table')).toContainText(TICKER);
    await expect(page.getByTestId('trade-error')).not.toBeVisible();

    await expect.poll(() => apiPositionQty(request, TICKER)).toBe(2);
    const after = await apiPortfolio(request);
    expect(after.cash_balance).toBeLessThan(before.cash_balance);
    const pos = after.positions.find((p) => p.ticker === TICKER)!;
    // Cash dropped by exactly qty * fill price.
    expect(before.cash_balance - after.cash_balance).toBeCloseTo(2 * pos.avg_cost, 2);
    await expectHeaderCash(page, after.cash_balance);
  });

  test('sell shares: partial sell updates the row, full sell removes it', async ({ page, request }) => {
    await apiTrade(request, TICKER, 'buy', 3);
    await openApp(page);
    const row = page.getByTestId(`position-row-${TICKER}`);
    await expect(row).toBeVisible();

    // Partial sell.
    const before = await apiPortfolio(request);
    await expectHeaderCash(page, before.cash_balance);
    await uiTrade(page, TICKER, 'sell', 1);
    await expect.poll(() => apiPositionQty(request, TICKER)).toBe(2);
    const mid = await apiPortfolio(request);
    expect(mid.cash_balance).toBeGreaterThan(before.cash_balance);
    await expectHeaderCash(page, mid.cash_balance);
    await expect(row).toBeVisible();

    // Full sell: the row disappears.
    await uiTrade(page, TICKER, 'sell', 2);
    await expect(row).toHaveCount(0);
    await expect.poll(() => apiPositionQty(request, TICKER)).toBe(0);
    const after = await apiPortfolio(request);
    expect(after.cash_balance).toBeGreaterThan(mid.cash_balance);
    await expectHeaderCash(page, after.cash_balance);

    // Ticker is still on the watchlist (it's a default ticker).
    await expect(page.getByTestId(`watchlist-row-${TICKER}`)).toBeVisible();
  });

  test('failed trade shows trade-error and changes nothing', async ({ page, request }) => {
    await openApp(page);
    const before = await apiPortfolio(request);

    // Selling shares we don't hold.
    await uiTrade(page, TICKER, 'sell', 1);
    await expect(page.getByTestId('trade-error')).toBeVisible();
    await expect(page.getByTestId('trade-error')).toContainText(/insufficient/i);

    // Buying far more than we can afford.
    await uiTrade(page, TICKER, 'buy', 1_000_000);
    await expect(page.getByTestId('trade-error')).toBeVisible();
    await expect(page.getByTestId('trade-error')).toContainText(/insufficient cash/i);

    const after = await apiPortfolio(request);
    expect(after.cash_balance).toBeCloseTo(before.cash_balance, 2);
    await expect(page.getByTestId(`position-row-${TICKER}`)).toHaveCount(0);
  });
});
