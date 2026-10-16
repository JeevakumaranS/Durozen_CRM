const BUSINESS_TIME_ZONE = "Asia/Kolkata";

export function businessDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as { year: number; month: number; day: number };
}

export function businessDateTime(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const localParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(utcGuess));
  const values = Object.fromEntries(
    localParts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const representedUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
  );
  return new Date(utcGuess - (representedUtc - utcGuess));
}

export function startOfBusinessDay(date: Date) {
  const { year, month, day } = businessDateParts(date);
  return businessDateTime(year, month, day);
}
