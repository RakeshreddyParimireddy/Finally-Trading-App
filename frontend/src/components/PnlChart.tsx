"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney, formatSignedMoney, toneClass } from "@/lib/format";
import type { Snapshot } from "@/lib/types";
import { Panel } from "./Panel";

const STARTING_CASH = 10000;

function shortTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
}

interface PnlChartProps {
  history: Snapshot[];
}

export function PnlChart({ history }: PnlChartProps) {
  const data = history
    .map((s) => ({ t: Date.parse(s.recorded_at), v: s.total_value }))
    .filter((d) => Number.isFinite(d.t));
  const last = data.length ? data[data.length - 1].v : null;
  const first = data.length ? data[0].v : null;
  const change = last != null && first != null ? last - first : null;
  const up = (change ?? 0) >= 0;

  return (
    <Panel
      title="Portfolio value"
      aside={
        change != null ? (
          <span className={`num ${toneClass(change)}`}>{formatSignedMoney(change)} over window</span>
        ) : null
      }
      className="h-full"
      bodyClassName="relative"
    >
      <div data-testid="pnl-chart" data-points={history.length} className="absolute inset-0 px-1 pt-2">
        {data.length < 2 ? (
          <div className="grid h-full place-items-center text-[12px] text-muted">
            {data.length === 1
              ? `${formatMoney(data[0].v)}: the line starts with the next snapshot (every 30s).`
              : "Value snapshots appear here every 30 seconds and after each trade."}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--color-line)" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={shortTime}
                tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                stroke="var(--color-line)"
                minTickGap={40}
              />
              <YAxis
                orientation="right"
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => formatMoney(v)}
                tick={{ fill: "var(--color-muted)", fontSize: 11 }}
                stroke="var(--color-line)"
                width={78}
              />
              <ReferenceLine y={STARTING_CASH} stroke="var(--color-faint)" strokeDasharray="3 4" />
              <Tooltip
                isAnimationActive={false}
                contentStyle={{
                  background: "var(--color-raised)",
                  border: "1px solid var(--color-line)",
                  fontSize: 12,
                }}
                labelFormatter={(t) => new Date(Number(t)).toLocaleString("en-US")}
                formatter={(v) => [formatMoney(Number(v)), "Total value"]}
              />
              <Line
                type="linear"
                dataKey="v"
                stroke={up ? "var(--color-blue)" : "var(--color-down)"}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Panel>
  );
}
