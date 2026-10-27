/** Business content, deliberately excluded from reusable design presets. */
export type ServicePrice = { amountCents: number; from?: boolean };
export type PriceListItem = { label: string; prices: ServicePrice[]; confirmationNote?: string };
export type PriceList = {
  title: string;
  serviceLabel: string;
  fromLabel: string;
  currency: "EUR";
  groups: Array<{ title: string; columns: string[]; items: PriceListItem[] }>;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid price list object.");
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 240): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("Invalid price list text.");
  return value;
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || !value.length || value.length > max) throw new Error("Invalid price list collection.");
  return value;
}
export function parsePriceList(input: unknown): PriceList {
  const value = record(input);
  if (value.currency !== "EUR") throw new Error("Unsupported price list currency.");
  return {
    title: text(value.title), serviceLabel: text(value.serviceLabel, 80), fromLabel: text(value.fromLabel, 16), currency: "EUR",
    groups: list(value.groups, 8).map(raw => {
      const group = record(raw);
      if (!Array.isArray(group.columns) || group.columns.length > 4) throw new Error("Invalid price columns.");
      const columns = group.columns.map(c => text(c, 40));
      if (new Set(columns).size !== columns.length) throw new Error("Duplicate price columns.");
      return { title: text(group.title, 80), columns, items: list(group.items, 100).map(raw => {
        const item = record(raw);
        const prices = list(item.prices, 4).map(raw => {
          const price = record(raw);
          if (typeof price.amountCents !== "number" || !Number.isSafeInteger(price.amountCents) || price.amountCents < 0 || price.amountCents > 100_000_000) throw new Error("Prices require nonnegative integer cents.");
          if (price.from !== undefined && typeof price.from !== "boolean") throw new Error("Invalid starting-price flag.");
          return { amountCents: price.amountCents, ...(price.from === undefined ? {} : { from: price.from }) };
        });
        if (prices.length !== 1 && prices.length !== columns.length) throw new Error("Price count must match the columns or be a single price.");
        return { label: text(item.label), prices, ...(item.confirmationNote === undefined ? {} : { confirmationNote: text(item.confirmationNote, 400) }) };
      }) };
    }),
  };
}
