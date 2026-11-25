import { test, expect } from '@playwright/test';
import { DEFAULT_TICKERS, apiPortfolio, formatMoney, openApp, readMoney } from './helpers';

test.describe('Fresh start', () => {
  test('health endpoint is up', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  test('shows the default watchlist, cash balance and a live connection', async ({ page, request }) => {
    await openApp(page);

    // 10 default tickers (a non-fresh DB may have more, but these must all be there unless removed;
    // on a fresh DB, which run-local.sh guarantees, every one is present).
    for (const t of DEFAULT_TICKERS) {
      await expect(page.getByTestId(`watchlist-row-${t}`), `watchlist row ${t}`).toBeVisible();
      await expect(page.getByTestId(`watchlist-price-${t}`)).toHaveText(/\d/);
    }

    // Cash in the header matches the backend. On a fresh DB that is exactly $10,000.00.
    const portfolio = await apiPortfolio(request);
    const cash = page.getByTestId('header-cash');
    await expect(cash).toContainText(formatMoney(portfolio.cash_balance));
    if (portfolio.positions.length === 0 && portfolio.cash_balance === 10000) {
      await expect(cash).toContainText('$10,000.00');
      await expect(page.getByTestId('header-total-value')).toContainText('$10,000.00');
      // Untouched DB: exactly the 10 seeded rows.
      await expect(page.locator('[data-testid^="watchlist-row-"]')).toHaveCount(DEFAULT_TICKERS.length);
    }

    // Header total value is a money amount close to the backend's total (prices move live).
    const total = await readMoney(page.getByTestId('header-total-value'));
    expect(total).toBeGreaterThan(0);
    expect(Math.abs(total - portfolio.total_value)).toBeLessThan(Math.max(50, portfolio.total_value * 0.05));
  });

  test('prices stream: at least one watchlist price changes within a few seconds', async ({ page }) => {
    await openApp(page);
    const readPrices = async () =>
      Promise.all(DEFAULT_TICKERS.map((t) => page.getByTestId(`watchlist-price-${t}`).textContent()));

    await expect(page.getByTestId('watchlist-price-AAPL')).toHaveText(/\d/);
    const initial = await readPrices();
    await expect
      .poll(
        async () => {
          const now = await readPrices();
          return now.some((p, i) => p !== initial[i]);
        },
        { message: 'some watchlist price changes', timeout: 10_000, intervals: [250] },
      )
      .toBe(true);

    await expect(page.getByTestId('connection-status')).toHaveAttribute('data-status', 'connected');
  });
});
