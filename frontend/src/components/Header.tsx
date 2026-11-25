import { formatMoney, formatSignedMoney, toneClass } from "@/lib/format";
import type { PortfolioTotals } from "@/lib/portfolio";
import type { ConnectionStatus } from "@/lib/types";

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: "Live",
  reconnecting: "Reconnecting",
  disconnected: "Offline",
};

const STATUS_DOT: Record<ConnectionStatus, string> = {
  connected: "bg-up",
  reconnecting: "bg-accent dot-pulse",
  disconnected: "bg-down",
};

interface HeaderProps {
  totals: PortfolioTotals | null;
  status: ConnectionStatus;
}

export function Header({ totals, status }: HeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-stretch border-b border-line bg-panel">
      <div className="flex items-center gap-2 border-r border-line px-4">
        <span aria-hidden className="block h-5 w-1.5 bg-accent" />
        <span className="text-[17px] font-bold tracking-tight text-text">
          Fin<span className="text-accent">Ally</span>
        </span>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-7 px-4">
        <div className="flex flex-col">
          <span className="text-[11px] text-muted">Portfolio value</span>
          <span
            data-testid="header-total-value"
            className="num text-[22px] leading-none font-semibold text-text"
          >
            {formatMoney(totals?.totalValue)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] text-muted">Cash</span>
          <span data-testid="header-cash" className="num text-[15px] leading-tight font-medium">
            {formatMoney(totals?.cash)}
          </span>
        </div>
        <div className="hidden flex-col sm:flex">
          <span className="text-[11px] text-muted">Unrealized P&amp;L</span>
          <span
            data-testid="header-pnl"
            className={`num text-[15px] leading-tight font-medium ${toneClass(totals?.unrealizedPnl)}`}
          >
            {formatSignedMoney(totals?.unrealizedPnl)}
          </span>
        </div>
        <div className="hidden flex-col md:flex">
          <span className="text-[11px] text-muted">Invested</span>
          <span className="num text-[15px] leading-tight font-medium">
            {formatMoney(totals?.positionsValue)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 border-l border-line px-4 text-[12px] text-muted">
        <span
          data-testid="connection-status"
          data-status={status}
          role="status"
          aria-label={`Price stream ${STATUS_LABEL[status].toLowerCase()}`}
          title={`Price stream: ${status}`}
          className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_DOT[status]}`}
        />
        <span>{STATUS_LABEL[status]}</span>
      </div>
    </header>
  );
}
