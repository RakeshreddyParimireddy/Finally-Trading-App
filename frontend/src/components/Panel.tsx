import type { ReactNode } from "react";

interface PanelProps {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  testId?: string;
}

/** Bordered terminal pane with a compact title strip. */
export function Panel({ title, aside, children, className = "", bodyClassName = "", testId }: PanelProps) {
  return (
    <section
      data-testid={testId}
      className={`flex h-full min-h-0 min-w-0 flex-col border border-line bg-panel ${className}`}
    >
      <header className="flex h-7 shrink-0 items-center justify-between gap-2 border-b border-line px-2.5">
        <h2 className="truncate text-[12px] font-semibold tracking-wide text-text">{title}</h2>
        {aside ? <div className="flex items-center gap-2 text-[11px] text-muted">{aside}</div> : null}
      </header>
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
