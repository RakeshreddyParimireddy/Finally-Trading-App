import { test, expect, type Page } from '@playwright/test';
import { apiPortfolio, apiPositionQty, apiUnwatch, apiWatchlist, openApp } from './helpers';

// Requires the backend to run with LLM_MOCK=true (contract §7).

async function sendChat(page: Page, text: string) {
  const assistant = page.locator('[data-testid="chat-message"][data-role="assistant"]');
  // Wait for the on-load history fetch to render, so the count below is stable.
  const history: { role: string }[] = await (await page.request.get('/api/chat/history')).json();
  const before = history.filter((m) => m.role === 'assistant').length;
  await expect(assistant, 'chat history rendered').toHaveCount(before);
  await page.getByTestId('chat-input').fill(text);
  await page.getByTestId('chat-send').click();
  await expect(
    page.locator('[data-testid="chat-message"][data-role="user"]').filter({ hasText: text }).last(),
  ).toBeVisible();
  await expect(assistant).toHaveCount(before + 1, { timeout: 20_000 });
  await expect(page.getByTestId('chat-loading')).not.toBeVisible();
  return assistant.last();
}

test.describe('AI chat (mock LLM)', () => {
  test.beforeAll(async ({ request }) => {
    await apiUnwatch(request, 'PYPL');
  });
  test.afterAll(async ({ request }) => {
    await apiUnwatch(request, 'PYPL');
  });

  test('greeting with no actions', async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId('chat-panel')).toBeVisible();
    const msg = await sendChat(page, 'hello there');
    await expect(msg).toContainText("I'm FinAlly");
    await expect(msg.getByTestId('chat-action')).toHaveCount(0);
  });

  test('"buy 1 AAPL" executes a trade shown inline and updates the portfolio', async ({ page, request }) => {
    const qtyBefore = await apiPositionQty(request, 'AAPL');
    const cashBefore = (await apiPortfolio(request)).cash_balance;

    await openApp(page);
    const msg = await sendChat(page, 'buy 1 AAPL');
    await expect(msg).toContainText(/Mock: executing buy 1 AAPL/i);
    const action = msg.getByTestId('chat-action');
    await expect(action.first()).toBeVisible();
    await expect(action.first()).toContainText('AAPL');

    await expect.poll(() => apiPositionQty(request, 'AAPL')).toBeCloseTo(qtyBefore + 1, 4);
    expect((await apiPortfolio(request)).cash_balance).toBeLessThan(cashBefore);
    // The UI refetches the portfolio after chat actions.
    await expect(page.getByTestId('position-row-AAPL')).toBeVisible();

    // Clean up the share we bought.
    await request.post('/api/portfolio/trade', { data: { ticker: 'AAPL', side: 'sell', quantity: 1 } });
  });

  test('"watch PYPL" adds PYPL to the watchlist', async ({ page, request }) => {
    await openApp(page);
    await expect(page.getByTestId('watchlist-row-PYPL')).toHaveCount(0);

    const msg = await sendChat(page, 'watch PYPL');
    await expect(msg).toContainText(/Mock: executing add\s+PYPL/i);
    await expect(msg.getByTestId('chat-action').first()).toContainText('PYPL');

    await expect(page.getByTestId('watchlist-row-PYPL')).toBeVisible();
    expect((await apiWatchlist(request)).map((w) => w.ticker)).toContain('PYPL');
  });

  test('chat history is reloaded on page load', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('[data-testid="chat-message"][data-role="user"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="chat-message"][data-role="assistant"]').first()).toBeVisible();
  });
});
