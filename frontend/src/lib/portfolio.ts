import type { Portfolio, Position, PriceUpdate } from "./types";

export interface LivePosition extends Position {
  /** Share of total positions value, 0..1. */
  weight: number;
}

/** Re-price positions with live SSE prices (falls back to the server's current_price). */
export function livePositions(
  positions: Position[],
  prices: Record<string, PriceUpdate>,
): LivePosition[] {
  const repriced = positions.map((pos) => {
    const price = prices[pos.ticker]?.price ?? pos.current_price;
    const market_value = pos.quantity * price;
    const cost_basis = pos.quantity * pos.avg_cost;
    const unrealized_pnl = market_value - cost_basis;
    const unrealized_pnl_percent = cost_basis > 0 ? (unrealized_pnl / cost_basis) * 100 : 0;
    return {
      ...pos,
      current_price: price,
      market_value,
      cost_basis,
      unrealized_pnl,
      unrealized_pnl_percent,
      weight: 0,
    };
  });
  const total = repriced.reduce((s, p) => s + p.market_value, 0);
  for (const p of repriced) p.weight = total > 0 ? p.market_value / total : 0;
  return repriced;
}

export interface PortfolioTotals {
  cash: number;
  positionsValue: number;
  totalValue: number;
  unrealizedPnl: number;
}

/** Header totals: cash + sum(qty x live price). */
export function portfolioTotals(
  portfolio: Portfolio | null,
  prices: Record<string, PriceUpdate>,
): PortfolioTotals | null {
  if (!portfolio) return null;
  const live = livePositions(portfolio.positions, prices);
  const positionsValue = live.reduce((s, p) => s + p.market_value, 0);
  const unrealizedPnl = live.reduce((s, p) => s + p.unrealized_pnl, 0);
  return {
    cash: portfolio.cash_balance,
    positionsValue,
    totalValue: portfolio.cash_balance + positionsValue,
    unrealizedPnl,
  };
}

export const HEATMAP_CLAMP = 5; // +/-5% = full saturation

/**
 * Heatmap fill for an unrealized P&L % (percent units).
 * 0% is a neutral slate; +/-5% or beyond is fully green / red.
 */
export function heatmapColor(pnlPercent: number): string {
  const v = Number.isFinite(pnlPercent) ? pnlPercent : 0;
  const t = Math.max(-1, Math.min(1, v / HEATMAP_CLAMP));
  const neutral = [38, 46, 59];
  const target = t >= 0 ? [22, 163, 106] : [214, 64, 84];
  const a = Math.abs(t);
  const mix = neutral.map((n, i) => Math.round(n + (target[i] - n) * a));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

/** Session change % from a price update (computed if the backend did not send it). */
export function sessionChangePercent(u: PriceUpdate | undefined): number | null {
  if (!u) return null;
  if (u.session_change_percent != null) return u.session_change_percent;
  if (u.session_open) return ((u.price - u.session_open) / u.session_open) * 100;
  return null;
}
