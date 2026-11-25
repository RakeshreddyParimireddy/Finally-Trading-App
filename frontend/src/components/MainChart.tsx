"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatPercent, formatPrice, toneClass } from "@/lib/format";
import { sessionChangePercent } from "@/lib/portfolio";
import { usePriceHistory } from "@/lib/priceStore";
import type { PriceUpdate } from "@/lib/types";

function clock(t: number): string {
  return new Date(t * 1000).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

interface MainChartProps {
  ticker: string | null;
  update: PriceUpdate | undefined;
}

export function MainChart({ ticker, update }: MainChartProps) {
  const data = usePriceHistory(ticker);
  const chg = sessionChangePercent(update);
  const rising = (chg ?? 0) >= 0;
  const stroke = rising ? "var(--color-up)" : "var(--color-down)";
  const open = update?.session_open ?? null;

  return (
    <section
      data-testid="main-chart"
      data-ticker={ticker ?? ""}
      className="flex h-full min-h-0 min-w-0 flex-col border border-line bg-panel"
    >
      <header className="flex shrink-0 items-baseline gap-4 border-b border-line px-3 py-1.5">
        <h2 className="text-[20px] leading-tight font-bold text-text">{ticker ?? "No symbol"}</h2>
        <span className="num text-[20px] leading-tight font-semibold">{formatPrice(update?.price)}</span>
        <span className={`num text-[13px] font-medium ${toneClass(chg)}`}>
          {formatPercent(chg)} <span className="text-muted">since open</span>
        </span>
        {open != null ? (
          <span className="num ml-auto text-[12px] text-muted">Session open {formatPrice(open)}</span>
        ) : null}
      </header>
      <div className="relative min-h-0 flex-1 px-1 pt-2">
        {data.length < 2 ? (
          <div className="absolute inset-0 grid place-items-center text-[12px] text-muted">
            {ticker ? "Collecting prices from the live stream…" : "Select a symbol in the watchlist."}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%" minHeight={120}>
            <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="main-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--color-line)" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={clock}
                tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                stroke="var(--color-line)"
                minTickGap={48}
              />
              <YAxis
                orientation="right"
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => formatPrice(v)}
                tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                stroke="var(--color-line)"
                width={64}
              />
              {open != null ? (
                <ReferenceLine y={open} stroke="var(--color-accent)" strokeOpacity={0.5} strokeDasharray="4 4" />
              ) : null}
              <Tooltip
                isAnimationActive={false}
                contentStyle={{
                  background: "var(--color-raised)",
                  border: "1px solid var(--color-line)",
                  fontSize: 12,
                }}
                labelFormatter={(t) => clock(Number(t))}
                formatter={(v) => [formatPrice(Number(v)), ticker ?? ""]}
              />
              <Area
                type="linear"
                dataKey="p"
                stroke={stroke}
                strokeWidth={1.5}
                fill="url(#main-fill)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
