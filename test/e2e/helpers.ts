import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

/** The 10 seeded watchlist tickers (contract §4.2 / PLAN §7). */
export const DEFAULT_TICKERS = [
  'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'NVDA', 'META', 'JPM', 'V', 'NFLX',
] as const;

export interface Position {
  ticker: string;
  quantity: number;
  avg_cost: number;
  current_price: number;
  market_value: number;
  cost_basis: number;
  unrealized_pnl: number;
  unrealized_pnl_percent: number;
}

export interface Portfolio {
  cash_balance: number;
  positions: Position[];
  positions_value: number;
  total_value: number;
  unrealized_pnl: number;
}

export interface WatchlistItem {
  ticker: string;
  price: number | null;
  previous_price: number | null;
  session_open: number | null;
  session_change_percent: number | null;
  direction: string | null;
}

/** Parse "$10,000.00" (or "-$12.34", "($12.34)") into a number. */
export function parseMoney(text: string | null | undefined): number {
  if (!text) return NaN;
  const negative = /-|\(/.test(text);
  const cleaned = text.replace(/[^0-9.]/g, '');
  const n = parseFloat(cleaned);
  return negative ? -n : n;
}

/** Format like the UI: en-US, 2 decimals, leading $. */
export function formatMoney(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** A ticker that is (almost certainly) not used anywhere else: ZZ + 4 random letters. */
export function uniqueTicker(prefix = 'ZZ'): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let s = prefix;
  for (let i = 0; i < 4; i++) s += letters[Math.floor(Math.random() * letters.length)];
  return s;
}

// ---------------------------------------------------------------- API helpers

export async function apiPortfolio(request: APIRequestContext): Promise<Portfolio> {
  const res = await request.get('/api/portfolio');
  expect(res.status(), 'GET /api/portfolio').toBe(200);
  return res.json();
}

export async function apiWatchlist(request: APIRequestContext): Promise<WatchlistItem[]> {
  const res = await request.get('/api/watchlist');
  expect(res.status(), 'GET /api/watchlist').toBe(200);
  return res.json();
}

export async function apiPositionQty(request: APIRequestContext, ticker: string): Promise<number> {
  const p = await apiPortfolio(request);
  return p.positions.find((x) => x.ticker === ticker)?.quantity ?? 0;
}

export async function apiTrade(
  request: APIRequestContext,
  ticker: string,
  side: 'buy' | 'sell',
  quantity: number,
) {
  const res = await request.post('/api/portfolio/trade', { data: { ticker, side, quantity } });
  expect(res.status(), `trade ${side} ${quantity} ${ticker}: ${await res.text()}`).toBe(200);
  return res.json();
}

/** Ensure ticker is on the watchlist and has a cached price (simulator seeds instantly). */
export async function apiEnsureWatched(request: APIRequestContext, ticker: string) {
  const res = await request.post('/api/watchlist', { data: { ticker } });
  expect(res.status(), `POST /api/watchlist ${ticker}`).toBe(200);
  await expect
    .poll(async () => (await apiWatchlist(request)).find((w) => w.ticker === ticker)?.price ?? null, {
      message: `price for ${ticker} becomes available`,
      timeout: 15_000,
    })
    .not.toBeNull();
}

/** Remove from watchlist if present (ignores 404). */
export async function apiUnwatch(request: APIRequestContext, ticker: string) {
  const res = await request.delete(`/api/watchlist/${ticker}`);
  expect([200, 404]).toContain(res.status());
}

/** Sell the entire position in `ticker` if one exists. */
export async function apiFlatten(request: APIRequestContext, ticker: string) {
  const qty = await apiPositionQty(request, ticker);
  if (qty > 0) await apiTrade(request, ticker, 'sell', qty);
}

// ---------------------------------------------------------------- UI helpers

/** Open the app and wait for the SSE connection + the watchlist to render. */
export async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('watchlist')).toBeVisible();
  await expect(page.getByTestId('connection-status')).toHaveAttribute('data-status', 'connected', {
    timeout: 15_000,
  });
}

export async function readMoney(locator: Locator): Promise<number> {
  return parseMoney(await locator.textContent());
}

/** Wait until the header cash equals `expected` (to the cent). */
export async function expectHeaderCash(page: Page, expected: number) {
  await expect
    .poll(async () => Math.round((await readMoney(page.getByTestId('header-cash'))) * 100), {
      message: `header-cash == ${formatMoney(expected)}`,
    })
    .toBe(Math.round(expected * 100));
}

/** Fill the trade bar and click buy/sell. */
export async function uiTrade(page: Page, ticker: string, side: 'buy' | 'sell', quantity: number) {
  await page.getByTestId('trade-ticker-input').fill(ticker);
  await page.getByTestId('trade-quantity-input').fill(String(quantity));
  await page.getByTestId(side === 'buy' ? 'trade-buy-button' : 'trade-sell-button').click();
}
