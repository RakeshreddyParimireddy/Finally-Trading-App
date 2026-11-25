import { test, expect } from '@playwright/test';
import {
  apiFlatten, apiPortfolio, apiTrade, apiUnwatch, apiWatchlist, uniqueTicker,
} from './helpers';

// API-level contract checks (contract §2, §5). No browser needed.

const TICKER = 'NFLX';

test.describe('API contract', () => {
  test.afterAll(async ({ request }) => {
    await apiFlatten(request, TICKER);
  });

  test('GET /api/watchlist shape', async ({ request }) => {
    const wl = await apiWatchlist(request);
    expect(Array.isArray(wl)).toBe(true);
    expect(wl.length).toBeGreaterThan(0);
    for (const w of wl) {
      expect(typeof w.ticker).toBe('string');
      for (const k of ['price', 'previous_price', 'session_open', 'session_change_percent', 'direction']) {
        expect(w, `watchlist item ${w.ticker} has ${k}`).toHaveProperty(k);
      }
    }
    const aapl = wl.find((w) => w.ticker === 'AAPL');
    if (aapl) expect(typeof aapl.price).toBe('number');
  });

  test('POST/DELETE /api/watchlist: normalise, idempotent, 400, 404', async ({ request }) => {
    const t = uniqueTicker();
    try {
      let res = await request.post('/api/watchlist', { data: { ticker: `  ${t.toLowerCase()} ` } });
      expect(res.status()).toBe(200);
      let body = await res.json();
      expect(body.map((w: { ticker: string }) => w.ticker)).toContain(t);

      // Idempotent re-add.
      res = await request.post('/api/watchlist', { data: { ticker: t } });
      expect(res.status()).toBe(200);
      body = await res.json();
      expect(body.filter((w: { ticker: string }) => w.ticker === t)).toHaveLength(1);

      // Bad format.
      for (const bad of ['', 'AB1', 'TOOLONGTICKER', 'A-B']) {
        res = await request.post('/api/watchlist', { data: { ticker: bad } });
        expect(res.status(), `POST watchlist "${bad}"`).toBe(400);
        expect(await res.json()).toHaveProperty('detail');
      }

      // Delete.
      res = await request.delete(`/api/watchlist/${t}`);
      expect(res.status()).toBe(200);
      expect((await res.json()).map((w: { ticker: string }) => w.ticker)).not.toContain(t);

      // Delete again: 404.
      res = await request.delete(`/api/watchlist/${t}`);
      expect(res.status()).toBe(404);
      expect(await res.json()).toHaveProperty('detail');
    } finally {
      await apiUnwatch(request, t);
    }
  });

  test('GET /api/portfolio shape', async ({ request }) => {
    const p = await apiPortfolio(request);
    for (const k of ['cash_balance', 'positions', 'positions_value', 'total_value', 'unrealized_pnl']) {
      expect(p, `portfolio has ${k}`).toHaveProperty(k);
    }
    expect(p.total_value).toBeCloseTo(p.cash_balance + p.positions_value, 1);
  });

  test('POST /api/portfolio/trade: success shape and validation errors', async ({ request }) => {
    await apiFlatten(request, TICKER);
    const before = await apiPortfolio(request);

    const body = await apiTrade(request, TICKER, 'buy', 1.23456);
    expect(body.trade).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        ticker: TICKER,
        side: 'buy',
        price: expect.any(Number),
        executed_at: expect.any(String),
      }),
    );
    expect(body.trade.quantity).toBeCloseTo(1.2346, 4); // rounded to 4 dp
    const pos = body.portfolio.positions.find((x: { ticker: string }) => x.ticker === TICKER);
    expect(pos).toBeTruthy();
    for (const k of ['quantity', 'avg_cost', 'current_price', 'market_value', 'cost_basis', 'unrealized_pnl', 'unrealized_pnl_percent']) {
      expect(pos, `position has ${k}`).toHaveProperty(k);
    }
    expect(body.portfolio.cash_balance).toBeCloseTo(
      before.cash_balance - body.trade.quantity * body.trade.price,
      1,
    );

    const expectError = async (data: object, status: number, detail?: RegExp) => {
      const res = await request.post('/api/portfolio/trade', { data });
      expect(res.status(), `trade ${JSON.stringify(data)}`).toBe(status);
      const json = await res.json();
      expect(json).toHaveProperty('detail');
      if (detail) expect(String(json.detail)).toMatch(detail);
    };

    await expectError({ ticker: TICKER, side: 'hold', quantity: 1 }, 400);
    await expectError({ ticker: TICKER, side: 'buy', quantity: 0 }, 400);
    await expectError({ ticker: TICKER, side: 'buy', quantity: -1 }, 400);
    await expectError({ ticker: TICKER, side: 'buy', quantity: 0.00001 }, 400); // 0 after rounding
    await expectError({ ticker: 'BAD1', side: 'buy', quantity: 1 }, 400);
    await expectError({ ticker: TICKER, side: 'buy', quantity: 1e9 }, 400, /insufficient cash/i);
    await expectError({ ticker: TICKER, side: 'sell', quantity: 1e6 }, 400, /insufficient shares/i);

    // A well-formed ticker that is neither watched nor held has no cached price -> 409.
    await expectError({ ticker: uniqueTicker('QX'), side: 'buy', quantity: 1 }, 409, /price unavailable/i);

    // Full sell removes the position.
    const sold = await apiTrade(request, TICKER, 'sell', body.trade.quantity);
    expect(sold.portfolio.positions.find((x: { ticker: string }) => x.ticker === TICKER)).toBeUndefined();
  });

  test('unknown /api path returns JSON 404, not the static HTML page', async ({ request }) => {
    for (const method of ['get', 'post', 'delete'] as const) {
      const res = await request[method]('/api/does-not-exist');
      expect(res.status(), `${method.toUpperCase()} /api/does-not-exist`).toBe(404);
      expect(res.headers()['content-type']).toContain('application/json');
      expect(await res.json()).toHaveProperty('detail');
    }
  });

  test('GET /api/portfolio/history shape', async ({ request }) => {
    const res = await request.get('/api/portfolio/history');
    expect(res.status()).toBe(200);
    const h = await res.json();
    expect(Array.isArray(h)).toBe(true);
    expect(h.length).toBeGreaterThanOrEqual(1);
    expect(h.length).toBeLessThanOrEqual(2880);
    expect(h[0]).toEqual(
      expect.objectContaining({ total_value: expect.any(Number), recorded_at: expect.any(String) }),
    );
    const times = h.map((x: { recorded_at: string }) => Date.parse(x.recorded_at));
    expect([...times].sort((a, b) => a - b)).toEqual(times); // ascending
  });

  test('POST /api/chat (mock) and GET /api/chat/history', async ({ request }) => {
    let res = await request.post('/api/chat', { data: { message: '' } });
    expect(res.status()).toBe(400);

    res = await request.post('/api/chat', { data: { message: 'hello' } });
    expect(res.status()).toBe(200);
    const msg = await res.json();
    expect(msg).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        role: 'assistant',
        content: expect.any(String),
        created_at: expect.any(String),
      }),
    );
    expect(msg.content).toContain("I'm FinAlly");

    // A failing action is reported per-action and summarised deterministically in content.
    res = await request.post('/api/chat', { data: { message: `sell 1000000 ${TICKER}` } });
    expect(res.status()).toBe(200);
    const failed = await res.json();
    expect(failed.actions.trades[0]).toEqual(
      expect.objectContaining({ ticker: TICKER, side: 'sell', status: 'failed' }),
    );
    expect(failed.actions.trades[0].error).toBeTruthy();
    expect(failed.content).toContain('Some actions could not be completed');

    res = await request.get('/api/chat/history');
    expect(res.status()).toBe(200);
    const history = await res.json();
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBeLessThanOrEqual(50);
    const last = history[history.length - 1];
    expect(last.role).toBe('assistant');
    expect(last.id).toBe(failed.id);
    expect(
      history.some((m: { role: string; content: string }) => m.role === 'user' && m.content === `sell 1000000 ${TICKER}`),
    ).toBe(true);
  });
});
