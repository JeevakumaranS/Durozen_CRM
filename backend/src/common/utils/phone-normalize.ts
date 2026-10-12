export function normalizePhoneNumber(value: string): string {
  const trimmed = value.trim();
  const hasInternationalPrefix = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return hasInternationalPrefix ? `+${digits}` : digits;
}
