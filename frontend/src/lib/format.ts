const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `$10,000.00` (contract §6). */
export function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return money.format(value);
}

/** Price without the currency sign, e.g. `1,234.56` (`1234.56` with grouping off). */
export function formatPrice(value: number | null | undefined, grouping = true): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: grouping,
  });
}

/** Signed money, e.g. `+$12.30` / `-$4.00`. */
export function formatSignedMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return sign + money.format(Math.abs(value));
}

/** Percent units in, e.g. 0.37 -> `+0.37%`. */
export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

/** Quantities: up to 4 decimals, no trailing zeros. */
export function formatQty(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function toneClass(value: number | null | undefined): string {
  if (value == null || value === 0 || !Number.isFinite(value)) return "text-muted";
  return value > 0 ? "text-up" : "text-down";
}
