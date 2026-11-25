"use client";

import { Line, LineChart, YAxis } from "recharts";
import { usePriceHistory } from "@/lib/priceStore";

interface SparklineProps {
  ticker: string;
  width?: number;
  height?: number;
}

/** Tiny price line accumulated from the SSE stream since page load. */
export function Sparkline({ ticker, width = 76, height = 22 }: SparklineProps) {
  const data = usePriceHistory(ticker);
  if (data.length < 2) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center"
        aria-hidden
      >
        <div className="h-px w-full bg-line" />
      </div>
    );
  }
  const rising = data[data.length - 1].p >= data[0].p;
  return (
    <div style={{ width, height }} aria-hidden>
      <LineChart width={width} height={height} data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Line
          type="linear"
          dataKey="p"
          stroke={rising ? "var(--color-up)" : "var(--color-down)"}
          strokeWidth={1.25}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </div>
  );
}
