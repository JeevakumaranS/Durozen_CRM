export type FlatRow = Record<string, string | number | boolean | null>;

export function flattenRow(value: unknown, prefix = ""): FlatRow {
  if (!value || typeof value !== "object" || value instanceof Date) {
    return prefix
      ? {
          [prefix]:
            value instanceof Date
              ? value.toISOString()
              : (value as string | number | boolean | null),
        }
      : {};
  }
  if (Object.getPrototypeOf(value)?.constructor?.name === "Decimal") {
    return prefix ? { [prefix]: String(value) } : {};
  }
  const output: FlatRow = {};
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) continue;
    const name = prefix ? `${prefix}_${key}` : key;
    if (
      child &&
      typeof child === "object" &&
      !Array.isArray(child) &&
      !(child instanceof Date)
    ) {
      Object.assign(output, flattenRow(child, name));
    } else if (Array.isArray(child)) {
      output[name] = child.map((item) => String(item)).join(", ");
    } else {
      output[name] =
        child instanceof Date
          ? child.toISOString()
          : (child as string | number | boolean | null);
    }
  }
  return output;
}
