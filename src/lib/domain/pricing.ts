/**
 * Sale pricing — TypeScript mirror of private.compute_sale (SQL), used for the
 * live cart preview. The DATABASE recomputes everything at finalization and is
 * the source of truth; tests check that both give identical results.
 *
 * All amounts are integer millimes. Intermediate products use BigInt because
 * amount × basis points can exceed Number.MAX_SAFE_INTEGER.
 *
 * Rules
 *   gross          = quantity × unit price
 *   line discount  = round_half_up(gross × bps / 10 000)
 *   line total     = gross − line discount
 *   subtotal       = Σ line totals
 *   total          = subtotal − order discount
 *   order discount is spread over lines proportionally to their totals:
 *   floor shares, leftover millimes to the largest remainders (ties: first line).
 */
export const MAX_BPS = 10_000;

export type PricingLineInput = { quantity: number; unitPriceMillimes: number; discountBps: number };

export type PricedLine = {
  gross: number;
  lineDiscount: number;
  lineTotal: number;
  orderDiscountShare: number;
  netTotal: number;
};

export type PricedSale = {
  lines: PricedLine[];
  subtotal: number;
  lineDiscount: number;
  orderDiscount: number;
  total: number;
};

function toBig(n: number, what: string): bigint {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`${what} must be a non-negative integer`);
  return BigInt(n);
}

/** round(a / b) half up, for non-negative bigints. */
function divRoundHalfUp(a: bigint, b: bigint): bigint {
  return (a * 2n + b) / (2n * b);
}

export function priceLine(line: PricingLineInput): Omit<PricedLine, "orderDiscountShare" | "netTotal"> {
  const qty = toBig(line.quantity, "quantity");
  const price = toBig(line.unitPriceMillimes, "unit price");
  const bps = toBig(line.discountBps, "discount");
  if (bps > BigInt(MAX_BPS)) throw new RangeError("discount above 100%");
  const gross = qty * price;
  const discount = divRoundHalfUp(gross * bps, 10_000n);
  return { gross: Number(gross), lineDiscount: Number(discount), lineTotal: Number(gross - discount) };
}

/** Largest-remainder allocation of `amount` proportionally to `weights`. */
export function allocate(amount: number, weights: number[]): number[] {
  const total = weights.reduce((s, w) => s + w, 0);
  if (amount === 0 || weights.length === 0) return weights.map(() => 0);
  if (amount < 0 || amount > total) throw new RangeError("amount out of range");
  const a = toBig(amount, "amount");
  const t = toBig(total, "total");
  const parts = weights.map((w, index) => {
    const product = toBig(w, "weight") * a;
    return { index, floor: product / t, remainder: product % t };
  });
  let leftover = a - parts.reduce((s, p) => s + p.floor, 0n);
  const order = [...parts].sort((x, y) => (y.remainder > x.remainder ? 1 : y.remainder < x.remainder ? -1 : x.index - y.index));
  const extra = new Map<number, bigint>();
  for (const p of order) {
    if (leftover <= 0n) break;
    extra.set(p.index, 1n);
    leftover -= 1n;
  }
  return parts.map((p) => Number(p.floor + (extra.get(p.index) ?? 0n)));
}

export function priceSale(lines: PricingLineInput[], orderDiscountMillimes = 0): PricedSale {
  const priced = lines.map(priceLine);
  const subtotal = priced.reduce((s, l) => s + l.lineTotal, 0);
  if (!Number.isSafeInteger(orderDiscountMillimes) || orderDiscountMillimes < 0 || orderDiscountMillimes > subtotal) {
    throw new RangeError("order discount out of range");
  }
  const shares = allocate(
    orderDiscountMillimes,
    priced.map((l) => l.lineTotal),
  );
  return {
    lines: priced.map((l, i) => ({ ...l, orderDiscountShare: shares[i], netTotal: l.lineTotal - shares[i] })),
    subtotal,
    lineDiscount: priced.reduce((s, l) => s + l.lineDiscount, 0),
    orderDiscount: orderDiscountMillimes,
    total: subtotal - orderDiscountMillimes,
  };
}

/**
 * Amount refunded for returning `quantity` units of a line, given what was
 * already returned. Cumulative rounding: returning every unit (in any number
 * of steps) refunds exactly the line's net total.
 */
export function returnAmount(netTotal: number, soldQuantity: number, alreadyReturned: number, quantity: number): number {
  if (quantity < 1 || alreadyReturned + quantity > soldQuantity) throw new RangeError("return quantity out of range");
  const net = toBig(netTotal, "net total");
  const sold = toBig(soldQuantity, "sold quantity");
  const after = divRoundHalfUp(net * BigInt(alreadyReturned + quantity), sold);
  const before = divRoundHalfUp(net * BigInt(alreadyReturned), sold);
  return Number(after - before);
}

/** Balance still due (positive) or owed back to the customer (negative). */
export function balanceDue(sale: { totalMillimes: number; returnedMillimes: number; paidMillimes: number }): number {
  return sale.totalMillimes - sale.returnedMillimes - sale.paidMillimes;
}

/** Percent text ("10", "12,5") → basis points (1250). Null if invalid. */
export function parsePercentToBps(input: string): number | null {
  const v = input.trim().replace(",", ".").replace(/\s*%$/, "");
  if (v === "") return 0;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(v)) return null;
  const [whole, fraction = ""] = v.split(".");
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return bps <= MAX_BPS ? bps : null;
}

export function formatBps(bps: number): string {
  const whole = Math.trunc(bps / 100);
  const fraction = bps % 100;
  return fraction === 0 ? `${whole} %` : `${whole},${String(fraction).padStart(2, "0").replace(/0$/, "")} %`;
}
