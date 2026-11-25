import { formatMoney, formatPercent, formatPrice, formatQty, formatSignedMoney, toneClass } from "@/lib/format";
import type { LivePosition } from "@/lib/portfolio";
import { Panel } from "./Panel";

interface PositionsTableProps {
  positions: LivePosition[];
  onSelect?: (ticker: string) => void;
}

export function PositionsTable({ positions, onSelect }: PositionsTableProps) {
  return (
    <Panel
      title="Positions"
      aside={<span className="num">{positions.length}</span>}
      className="h-full"
      bodyClassName="overflow-auto"
    >
      <table data-testid="positions-table" className="w-full border-collapse text-[13px]">
        <thead className="sticky top-0 bg-panel text-[11px] text-muted">
          <tr className="[&>th]:px-2.5 [&>th]:py-1 [&>th]:font-normal">
            <th className="text-left">Symbol</th>
            <th className="text-right">Qty</th>
            <th className="text-right">Avg cost</th>
            <th className="text-right">Last</th>
            <th className="text-right">Value</th>
            <th className="text-right">Unrealized P&amp;L</th>
            <th className="text-right">Chg %</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <tr
              key={p.ticker}
              data-testid={`position-row-${p.ticker}`}
              onClick={() => onSelect?.(p.ticker)}
              className="num cursor-pointer border-b border-line/60 hover:bg-raised/60 [&>td]:px-2.5 [&>td]:py-1.5"
            >
              <td className="text-left font-semibold">{p.ticker}</td>
              <td className="text-right" data-testid={`position-qty-${p.ticker}`}>
                {formatQty(p.quantity)}
              </td>
              <td className="text-right text-muted">{formatPrice(p.avg_cost)}</td>
              <td className="text-right">{formatPrice(p.current_price)}</td>
              <td className="text-right">{formatMoney(p.market_value)}</td>
              <td className={`text-right ${toneClass(p.unrealized_pnl)}`}>{formatSignedMoney(p.unrealized_pnl)}</td>
              <td className={`text-right ${toneClass(p.unrealized_pnl_percent)}`}>
                {formatPercent(p.unrealized_pnl_percent)}
              </td>
            </tr>
          ))}
          {positions.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-2.5 py-4 text-muted">
                You hold no positions. Use the order bar or ask the assistant to buy something.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </Panel>
  );
}
