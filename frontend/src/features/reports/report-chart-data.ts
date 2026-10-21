type ReportRow = Record<string, unknown>;

export type TrendGrain = "day" | "week" | "month";

export type TrendPoint = {
  date: string;
  label: string;
  value?: number;
  won?: number;
  lost?: number;
};

export type TrendSeries = {
  dataKey: "value" | "won" | "lost";
  label: string;
  color: string;
};

export type TrendData = {
  data: TrendPoint[];
  grain: TrendGrain;
  series: TrendSeries[];
  allowsNegative: boolean;
};

export type TrendDomain = [number, number];

export type LineCategoryPoint = {
  name: string;
  value: number;
};

const lineRowFields: Record<
  string,
  { labelField: string; metricField?: string }
> = {
  "bde-performance": { labelField: "name", metricField: "totalLeads" },
  leads: { labelField: "customerName" },
  "lead-aging": { labelField: "customerName" },
  pipeline: { labelField: "customerName", metricField: "estimatedBudget" },
  "follow-ups": { labelField: "lead.customerName" },
  proposals: { labelField: "proposalNumber", metricField: "finalAmount" },
  "won-lost": { labelField: "customerName", metricField: "finalDealValue" },
  revenue: { labelField: "customerName", metricField: "finalDealValue" },
  "lost-leads": { labelField: "customerName", metricField: "finalDealValue" },
};

const trendMappings: Record<
  string,
  { dateField: string; metric: "count" | "revenue" | "won-lost" }
> = {
  leads: { dateField: "createdAt", metric: "count" },
  "follow-ups": { dateField: "dueAt", metric: "count" },
  proposals: { dateField: "proposalDate", metric: "count" },
  "won-lost": { dateField: "stageEnteredAt", metric: "won-lost" },
  revenue: { dateField: "stageEnteredAt", metric: "revenue" },
  "lost-leads": { dateField: "stageEnteredAt", metric: "count" },
};

const recordSeries: TrendSeries = {
  dataKey: "value",
  label: "Records",
  color: "#528c91",
};

const revenueSeries: TrendSeries = {
  dataKey: "value",
  label: "Revenue",
  color: "#528c91",
};

function readValue(row: ReportRow, path: string): unknown {
  return path.split(".").reduce<unknown>((value, part) => {
    if (value === null || typeof value !== "object") return undefined;
    return (value as ReportRow)[part];
  }, row);
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const datePrefix = /^(\d{4}-\d{2}-\d{2})(?:$|T)/.exec(value)?.[1];
  if (datePrefix) {
    const validatedDate = dateKeyForInput(datePrefix);
    if (!validatedDate) return null;
    if (value === datePrefix) return validatedDate;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function businessDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateKeyForInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() + 1 !== Number(match[2]) ||
    date.getUTCDate() !== Number(match[3])
  ) {
    return null;
  }
  return date;
}

function dateRangeDays(from: string | undefined, to: string | undefined) {
  const start = from ? dateKeyForInput(from) : null;
  const end = to ? dateKeyForInput(to) : null;
  if (!start || !end || end < start) return null;
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function chooseGrain(
  from: string | undefined,
  to: string | undefined,
  observedDates: Date[],
): TrendGrain {
  let days = dateRangeDays(from, to);
  if (days === null && observedDates.length > 1) {
    let first = Number.POSITIVE_INFINITY;
    let last = Number.NEGATIVE_INFINITY;
    for (const date of observedDates) {
      const timestamp = Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
      );
      first = Math.min(first, timestamp);
      last = Math.max(last, timestamp);
    }
    days = Math.floor((last - first) / 86_400_000) + 1;
  }
  if (days === null || days <= 62) return "day";
  if (days <= 366) return "week";
  return "month";
}

function bucketDate(date: Date, grain: TrendGrain) {
  const [year, month, day] = businessDateKey(date).split("-").map(Number);
  const bucket = new Date(Date.UTC(year, month - 1, day));
  if (grain === "week") {
    const daysFromMonday = (bucket.getUTCDay() + 6) % 7;
    bucket.setUTCDate(bucket.getUTCDate() - daysFromMonday);
  } else if (grain === "month") {
    bucket.setUTCDate(1);
  }
  return [
    bucket.getUTCFullYear(),
    String(bucket.getUTCMonth() + 1).padStart(2, "0"),
    String(bucket.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function formatBucket(key: string, grain: TrendGrain) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (grain === "week") {
    return `Week of ${new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(date)}`;
  }
  return new Intl.DateTimeFormat("en-IN", {
    ...(grain === "day" ? { day: "numeric" } : {}),
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

function numericValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildLineCategoryData(
  apiType: string,
  rows: ReportRow[],
): LineCategoryPoint[] {
  const mapping = lineRowFields[apiType];
  if (!mapping) return [];

  const labelCounts = new Map<string, number>();
  return rows.flatMap((row, index) => {
    const value = mapping.metricField
      ? numericValue(readValue(row, mapping.metricField))
      : 1;
    if (value === null) return [];

    const rawLabel =
      readValue(row, mapping.labelField) ??
      readValue(row, "businessName") ??
      readValue(row, "stage") ??
      readValue(row, "id");
    const baseLabel =
      typeof rawLabel === "string" && rawLabel.trim()
        ? rawLabel.trim()
        : `Record ${index + 1}`;
    const occurrence = (labelCounts.get(baseLabel) ?? 0) + 1;
    labelCounts.set(baseLabel, occurrence);
    return [
      {
        name: occurrence === 1 ? baseLabel : `${baseLabel} (${occurrence})`,
        value,
      },
    ];
  });
}

export function supportsTrend(apiType: string) {
  return Object.hasOwn(trendMappings, apiType);
}

export function trendDomain(
  trend: TrendData,
  stacked = false,
): TrendDomain {
  let minimum = 0;
  let maximum = 0;
  for (const point of trend.data) {
    if (stacked) {
      const total = trend.series.reduce((sum, series) => {
        const value = point[series.dataKey];
        return sum + (typeof value === "number" ? value : 0);
      }, 0);
      minimum = Math.min(minimum, total);
      maximum = Math.max(maximum, total);
      continue;
    }
    for (const series of trend.series) {
      const value = point[series.dataKey];
      if (typeof value === "number" && Number.isFinite(value)) {
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
      }
    }
  }
  if (minimum === maximum) return [0, 1];
  const padding = (maximum - minimum) * 0.08;
  return [
    minimum < 0 ? minimum - padding : 0,
    maximum > 0 ? maximum + padding : 0,
  ];
}

export function buildTrendData(
  apiType: string,
  rows: ReportRow[],
  from?: string,
  to?: string,
): TrendData {
  const mapping = Object.hasOwn(trendMappings, apiType)
    ? trendMappings[apiType]
    : undefined;
  if (!mapping) {
    return { data: [], grain: "day", series: [], allowsNegative: false };
  }

  const datedRows = rows.flatMap((row) => {
    const date = parseDate(readValue(row, mapping.dateField));
    return date ? [{ row, date }] : [];
  });
  const grain = chooseGrain(
    from,
    to,
    datedRows.map(({ date }) => date),
  );
  const buckets = new Map<
    string,
    { value?: number; won?: number; lost?: number }
  >();

  for (const { row, date } of datedRows) {
    const key = bucketDate(date, grain);
    const bucket = buckets.get(key) ?? {};

    if (mapping.metric === "revenue") {
      const amount = numericValue(readValue(row, "finalDealValue"));
      if (amount === null) continue;
      bucket.value = (bucket.value ?? 0) + amount;
    } else if (mapping.metric === "won-lost") {
      const stage = readValue(row, "stage");
      if (stage === "WON") bucket.won = (bucket.won ?? 0) + 1;
      else if (stage === "LOST") bucket.lost = (bucket.lost ?? 0) + 1;
      else continue;
    } else {
      bucket.value = (bucket.value ?? 0) + 1;
    }
    buckets.set(key, bucket);
  }

  const data = [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, values]) => ({
      date,
      label: formatBucket(date, grain),
      ...(mapping.metric === "won-lost"
        ? { won: values.won ?? 0, lost: values.lost ?? 0 }
        : values),
    }));

  if (mapping.metric === "won-lost") {
    return {
      data,
      grain,
      series: [
        { dataKey: "won", label: "Won", color: "#528c91" },
        { dataKey: "lost", label: "Lost", color: "#d16c83" },
      ],
      allowsNegative: false,
    };
  }

  return {
    data,
    grain,
    series: [mapping.metric === "revenue" ? revenueSeries : recordSeries],
    allowsNegative: mapping.metric === "revenue",
  };
}
