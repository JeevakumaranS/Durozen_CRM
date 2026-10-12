export function toMinorUnits(amount: number, fractionDigits = 2): number {
  if (!Number.isFinite(amount)) throw new TypeError("Amount must be finite");
  return Math.round(amount * 10 ** fractionDigits);
}

export function fromMinorUnits(amount: number, fractionDigits = 2): number {
  if (!Number.isFinite(amount)) throw new TypeError("Amount must be finite");
  return amount / 10 ** fractionDigits;
}
