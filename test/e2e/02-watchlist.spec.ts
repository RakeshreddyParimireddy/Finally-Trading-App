import { test, expect } from '@playwright/test';
import { apiUnwatch, apiWatchlist, openApp, uniqueTicker } from './helpers';

test.describe('Watchlist', () => {
  const ticker = uniqueTicker();

  test.afterEach(async ({ request }) => {
    await apiUnwatch(request, ticker);
  });

  test('add a ticker, see it stream, then remove it', async ({ page, request }) => {
    await openApp(page);
    await expect(page.getByTestId(`watchlist-row-${ticker}`)).toHaveCount(0);

    // Add (typed lower-case: the backend upper-cases it).
    await page.getByTestId('watchlist-add-input').fill(ticker.toLowerCase());
    await page.getByTestId('watchlist-add-button').click();

    const row = page.getByTestId(`watchlist-row-${ticker}`);
    await expect(row).toBeVisible();
    // The simulator seeds unknown tickers, so a price shows up.
    await expect(page.getByTestId(`watchlist-price-${ticker}`)).toHaveText(/\d/, { timeout: 15_000 });
    expect((await apiWatchlist(request)).map((w) => w.ticker)).toContain(ticker);

    // Survives a reload (persisted in the DB).
    await page.reload();
    await expect(page.getByTestId(`watchlist-row-${ticker}`)).toBeVisible();

    // Remove.
    await page.getByTestId(`watchlist-row-${ticker}`).hover(); // remove button may be hover-revealed
    await page.getByTestId(`watchlist-remove-${ticker}`).click();
    await expect(page.getByTestId(`watchlist-row-${ticker}`)).toHaveCount(0);
    expect((await apiWatchlist(request)).map((w) => w.ticker)).not.toContain(ticker);

    // Other rows are untouched.
    await expect(page.getByTestId('watchlist-row-AAPL')).toBeVisible();
  });
});
