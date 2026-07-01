/** Parse a display price like "$5.50" or "$4 / $5" into cents. Returns null if unparseable. */
export function parsePriceToCents(price?: string | null): number | null {
  if (!price) return null;
  const match = price.match(/\$(\d+(?:\.\d{1,2})?)/);
  if (!match) return null;
  return Math.round(parseFloat(match[1]) * 100);
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
