"use client";

import { ResponsiveContainer, Treemap, type TreemapNode } from "recharts";
import { formatPercent, formatSignedMoney } from "@/lib/format";
import { heatmapColor, type LivePosition } from "@/lib/portfolio";
import { Panel } from "./Panel";

interface HeatmapProps {
  positions: LivePosition[];
  onSelect?: (ticker: string) => void;
  /** Fixed size (tests); otherwise fills its panel. */
  width?: number;
  height?: number;
}

interface Cell {
  [key: string]: unknown;
  name: string;
  size: number;
  pnl: number;
  pnlPct: number;
  weight: number;
}

function makeTile(onSelect?: (ticker: string) => void) {
  return function Tile(node: TreemapNode) {
    const { x, y, width, height, depth, name } = node;
    if (depth !== 1 || width <= 0 || height <= 0) return <g />;
    const pnlPct = Number(node.pnlPct ?? 0);
    const pnl = Number(node.pnl ?? 0);
    const weight = Number(node.weight ?? 0);
    const roomy = width > 64 && height > 40;
    const tiny = width < 36 || height < 18;
    return (
      <g
        data-testid={`heatmap-cell-${name}`}
        data-pnl-percent={pnlPct.toFixed(2)}
        style={{ cursor: onSelect ? "pointer" : undefined }}
        onClick={() => onSelect?.(name)}
      >
        <title>{`${name}: ${formatPercent(pnlPct)} (${formatSignedMoney(pnl)}), ${(weight * 100).toFixed(1)}% of holdings`}</title>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={heatmapColor(pnlPct)}
          stroke="var(--color-bg)"
          strokeWidth={2}
        />
        {!tiny ? (
          <text x={x + 6} y={y + 16} fill="#f3f6fa" fontSize={13} fontWeight={700}>
            {name}
          </text>
        ) : null}
        {roomy ? (
          <text x={x + 6} y={y + 31} fill="#f3f6fa" fillOpacity={0.85} fontSize={11.5} className="num">
            {formatPercent(pnlPct)}
          </text>
        ) : null}
      </g>
    );
  };
}

export function Heatmap({ positions, onSelect, width, height }: HeatmapProps) {
  const data: Cell[] = positions
    .filter((p) => p.market_value > 0)
    .map((p) => ({
      name: p.ticker,
      size: p.market_value,
      pnl: p.unrealized_pnl,
      pnlPct: p.unrealized_pnl_percent,
      weight: p.weight,
    }));
  const tile = makeTile(onSelect);

  const chart = (
    <Treemap
      data={data}
      dataKey="size"
      nameKey="name"
      aspectRatio={1.4}
      isAnimationActive={false}
      content={tile}
      width={width}
      height={height}
    />
  );

  return (
    <Panel
      title="Holdings heatmap"
      aside={<span>Size: value · colour: P&amp;L % (±5%)</span>}
      testId="heatmap"
      bodyClassName="relative"
    >
      {data.length === 0 ? (
        <div className="absolute inset-0 grid place-items-center px-4 text-center text-[12px] text-muted">
          No positions yet. Buy a stock and it appears here, sized by value.
        </div>
      ) : width && height ? (
        chart
      ) : (
        <div className="absolute inset-0">
          <ResponsiveContainer width="100%" height="100%">
            {chart}
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}
