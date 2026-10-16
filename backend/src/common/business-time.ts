const BUSINESS_TIME_ZONE = "Asia/Kolkata";

export function formatBusinessDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(value);
}
