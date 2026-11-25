"use client";

import { useEffect, useRef } from "react";
import { formatPrice } from "@/lib/format";

export const FLASH_MS = 300;
export const FLASH_MIN_CHANGE = 0.01;

interface PriceCellProps {
  price: number | null | undefined;
  testId?: string;
  className?: string;
}

/**
 * Price text that flashes green/red for ~300ms when the price moves by at least $0.01.
 * The class is toggled directly on the DOM node: no re-render per tick beyond the price itself.
 */
export function PriceCell({ price, testId, className = "" }: PriceCellProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef<number | null | undefined>(price);

  useEffect(() => {
    const el = ref.current;
    const before = prev.current;
    prev.current = price;
    if (!el || before == null || price == null) return;
    const diff = price - before;
    if (Math.abs(diff) < FLASH_MIN_CHANGE - 1e-9) return;
    el.classList.remove("flash-up", "flash-down");
    el.classList.add(diff > 0 ? "flash-up" : "flash-down");
    const timer = setTimeout(() => el.classList.remove("flash-up", "flash-down"), FLASH_MS);
    return () => {
      clearTimeout(timer);
      el.classList.remove("flash-up", "flash-down");
    };
  }, [price]);

  return (
    <span ref={ref} data-testid={testId} className={`price-cell num px-1 ${className}`}>
      {/* No thousands separator: the text stays machine-parseable (E2E reads it). */}
      {formatPrice(price, false)}
    </span>
  );
}
