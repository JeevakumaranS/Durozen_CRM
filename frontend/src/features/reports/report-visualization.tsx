"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  buildLineCategoryData,
  buildTrendData,
  supportsTrend,
  trendDomain,
  type TrendData,
} from "./report-chart-data";
import styles from "./report-visualization.module.css";

type ReportRow = Record<string, unknown>;

export type ReportChartType =
  | "pie"
  | "column"
  | "bar"
  | "line"
  | "table"
  | "area";

type ChartOption = {
  type: ReportChartType;
  label: string;
};

type ReportChartProps = {
  apiType: string;
  rows: ReportRow[];
  from?: string;
  to?: string;
};

type ReportChartSelectorProps = ReportChartProps & {
  appliedType: ReportChartType;
  loading: boolean;
  error: string;
  onApply: (type: ReportChartType) => void;
};

const chartOptions: ChartOption[] = [
  { type: "pie", label: "Pie Chart" },
  { type: "column", label: "Column Chart" },
  { type: "bar", label: "Bar Chart" },
  { type: "line", label: "Line Chart" },
  { type: "table", label: "Table" },
  { type: "area", label: "Area Chart" },
];

const chartColors = [
  "#ed8f70",
  "#f2b34f",
  "#528c91",
  "#7761ad",
  "#71a875",
  "#d16c83",
  "#5d8fc2",
  "#c3984c",
];

const categoryFields: Record<string, string> = {
  leads: "stage",
  "bde-performance": "name",
  pipeline: "stage",
  "lead-aging": "stage",
  "follow-ups": "status",
  proposals: "customerResponse",
  "won-lost": "stage",
  revenue: "assignedBde.fullName",
  "lost-leads": "lostReason",
};

const metricFields: Record<string, string> = {
  "bde-performance": "totalLeads",
  proposals: "finalAmount",
  "won-lost": "finalDealValue",
  revenue: "finalDealValue",
};

const metricLabels: Record<string, string> = {
  "bde-performance": "Total Leads",
  pipeline: "Lead Count",
  proposals: "Proposal Value",
  "won-lost": "Deal Value",
  revenue: "Revenue",
  "lost-leads": "Lead Count",
};

const currencyMetricTypes = new Set([
  "revenue",
  "proposals",
  "won-lost",
]);

const summaryMetrics = [
  ["totalLeads", "Total Leads"],
  ["contacted", "Contacted Leads"],
  ["interested", "Interested Leads"],
  ["meetings", "Meetings"],
  ["proposals", "Proposals"],
  ["negotiations", "Negotiations"],
  ["won", "Won Deals"],
  ["lost", "Lost Deals"],
  ["revenue", "Revenue"],
  ["conversionRate", "Conversion Rate"],
] as const;

const categoryOrders: Record<string, string[]> = {
  leads: [
    "NEW_LEAD",
    "CONTACTED",
    "INTERESTED",
    "MEETING",
    "PROPOSAL",
    "NEGOTIATION",
    "WON",
    "LOST",
  ],
  pipeline: [
    "NEW_LEAD",
    "CONTACTED",
    "INTERESTED",
    "MEETING",
    "PROPOSAL",
    "NEGOTIATION",
  ],
  "lead-aging": [
    "NEW_LEAD",
    "CONTACTED",
    "INTERESTED",
    "MEETING",
    "PROPOSAL",
    "NEGOTIATION",
    "WON",
    "LOST",
  ],
  "won-lost": ["WON", "LOST"],
  "monthly-summary": summaryMetrics.map(([, label]) => label),
};

function readValue(row: ReportRow, path: string): unknown {
  return path.split(".").reduce<unknown>((value, part) => {
    if (value === null || typeof value !== "object") return undefined;
    return (value as ReportRow)[part];
  }, row);
}

function valueAsNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const number = Number(value.replaceAll(",", ""));
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function isReportChartType(value: string): value is ReportChartType {
  return chartOptions.some((option) => option.type === value);
}

function formatCurrency(value: string | number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function buildCategoryData(apiType: string, rows: ReportRow[]) {
  if (apiType === "monthly-summary") {
    const summary = rows[0];
    if (!summary) return [];
    return summaryMetrics.flatMap(([key, label]) => {
      const value = valueAsNumber(summary[key]);
      return value === null ? [] : [{ name: label, value }];
    });
  }

  const categoryField = categoryFields[apiType];
  if (!categoryField) return [];
  const metricField = metricFields[apiType];
  const grouped = new Map<string, { value: number; count: number }>();

  for (const row of rows) {
    const rawCategory = readValue(row, categoryField);
    const category =
      rawCategory === null || rawCategory === undefined || rawCategory === ""
        ? "Not recorded"
        : String(rawCategory);
    const current = grouped.get(category) ?? { value: 0, count: 0 };
    const metric = metricField ? valueAsNumber(readValue(row, metricField)) : null;
    current.value += metric ?? 0;
    current.count += 1;
    grouped.set(category, current);
  }

  return [...grouped.entries()]
    .map(([name, group]) => ({
      name,
      value: metricField ? group.value : group.count,
    }))
    .sort((left, right) => right.value - left.value);
}

function ChartTypeIcon({ type }: { type: ReportChartType }) {
  return (
    <svg
      aria-hidden="true"
      className={styles.chartIcon}
      fill="none"
      viewBox="0 0 24 24"
    >
      {type === "pie" && (
        <path d="M11 3a9 9 0 1 0 10 10H11V3Z M14 3v7h7a9 9 0 0 0-7-7Z" />
      )}
      {type === "column" && (
        <path d="M3 20h18M5 18V9h3v9m4 0V4h3v14m4 0v-6h3v6" />
      )}
      {type === "bar" && (
        <path d="M4 4v16m0-13h15M4 11h10M4 18h17" />
      )}
      {type === "line" && (
        <>
          <path d="M3 19h18M4 16l5-5 4 3 7-9" />
          <circle cx="4" cy="16" r="1" />
          <circle cx="9" cy="11" r="1" />
          <circle cx="13" cy="14" r="1" />
          <circle cx="20" cy="5" r="1" />
        </>
      )}
      {type === "table" && (
        <path d="M3 4h18v16H3zM3 10h18M3 15h18M9 4v16M15 4v16" />
      )}
      {type === "area" && (
        <path d="M3 19h18M4 16l5-5 4 3 7-9v14H4v-3Z" />
      )}
    </svg>
  );
}

function TrendChart({
  trend,
  apiType,
}: {
  trend: TrendData;
  apiType: string;
}) {
  const isSinglePoint = trend.data.length === 1;
  const isStackedArea = apiType === "won-lost";
  const valueDomain = trendDomain(
    trend,
    isStackedArea && !isSinglePoint,
  );
  const axisTitle =
    trend.grain === "day"
      ? "Date"
      : trend.grain === "week"
        ? "Week"
        : "Month";
  const yAxisTitle = apiType === "revenue" ? "Revenue (INR)" : "Record count";
  const sharedXAxisProps = {
    dataKey: "label",
    interval: "preserveStartEnd" as const,
    angle: trend.data.length > 7 ? -25 : 0,
    textAnchor: (trend.data.length > 7 ? "end" : "middle") as "end" | "middle",
    height: trend.data.length > 7 ? 64 : 52,
    label: {
      value: axisTitle,
      position: "bottom" as const,
      offset: 2,
      fill: "#52676e",
      fontSize: 11,
    },
    tick: { fill: "#52676e", fontSize: 11 },
  };
  const sharedYAxisProps = {
    allowDecimals: apiType === "revenue",
    domain: valueDomain,
    width: 68,
    tick: { fill: "#52676e", fontSize: 11 },
    tickFormatter: (value: number) =>
      apiType === "revenue"
        ? new Intl.NumberFormat("en-IN", {
            notation: "compact",
            maximumFractionDigits: 1,
          }).format(value)
        : String(value),
    label: {
      value: yAxisTitle,
      angle: -90 as const,
      position: "insideLeft" as const,
      fill: "#52676e",
      fontSize: 11,
    },
  };
  const chartMargin = { top: 18, right: 24, left: 12, bottom: 20 };

  if (isSinglePoint) {
    return (
      <>
        <div
          aria-label="Single-period area value"
          className={styles.chartCanvas}
          role="img"
        >
          <ResponsiveContainer height="100%" minHeight={280} width="100%">
            <BarChart data={trend.data} margin={chartMargin}>
              <CartesianGrid stroke="#e6ecec" strokeDasharray="3 3" />
              <XAxis {...sharedXAxisProps} />
              <YAxis {...sharedYAxisProps} />
              <Tooltip
                labelFormatter={(label) => String(label)}
                formatter={(value, name) => [
                  apiType === "revenue"
                    ? formatCurrency(String(value))
                    : value,
                  String(name),
                ]}
              />
              {trend.series.length > 1 && (
                <Legend
                  align="center"
                  height={32}
                  verticalAlign="top"
                  wrapperStyle={{ fontSize: 12 }}
                />
              )}
              {trend.series.map((series) => (
                <Bar
                  dataKey={series.dataKey}
                  fill={series.color}
                  key={series.dataKey}
                  name={series.label}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className={styles.trendNote} role="status">
          This filled column shows the one available {trend.grain} value. More
          dated records are needed to display an area trend.
        </p>
      </>
    );
  }
  const chartContent = (
    <AreaChart data={trend.data} margin={chartMargin}>
        <CartesianGrid stroke="#e6ecec" strokeDasharray="3 3" />
        <XAxis {...sharedXAxisProps} />
        <YAxis {...sharedYAxisProps} />
        <Tooltip
          labelFormatter={(label) => String(label)}
          formatter={(value, name) => [
            apiType === "revenue" ? formatCurrency(String(value)) : value,
            String(name),
          ]}
        />
        {trend.series.length > 1 && (
          <Legend
            align="center"
            height={32}
            verticalAlign="top"
            wrapperStyle={{ fontSize: 12 }}
          />
        )}
        {trend.series.map((series) => (
          <Area
            activeDot={{ r: 7 }}
            baseValue={0}
            connectNulls={false}
            dataKey={series.dataKey}
            dot={{ r: isSinglePoint ? 6 : 4, strokeWidth: 2 }}
            fill={series.color}
            fillOpacity={0.28}
            key={series.dataKey}
            name={series.label}
            stroke={series.color}
            strokeWidth={3}
            stackId={apiType === "won-lost" ? "outcomes" : undefined}
            type="monotone"
          />
        ))}
    </AreaChart>
  );

  return (
    <>
      <div
        aria-label="Area chart"
        className={styles.chartCanvas}
        role="img"
      >
        <ResponsiveContainer height="100%" minHeight={280} width="100%">
          {chartContent}
        </ResponsiveContainer>
      </div>
      {isSinglePoint && (
        <p className={styles.trendNote} role="status">
          Only one {trend.grain} has records in this range. More dated records
          are needed to show a meaningful area trend.
        </p>
      )}
    </>
  );
}

function ChartDisplay({
  apiType,
  rows,
  type,
  from,
  to,
}: ReportChartProps & { type: ReportChartType }) {
  const categoryData = buildCategoryData(apiType, rows);
  const trend = buildTrendData(apiType, rows, from, to);
  const valueLabel =
    metricLabels[apiType] ??
    (apiType === "monthly-summary" ? "Metric value" : "Records");

  if (type === "table") {
    return (
      <div className={styles.tablePreview}>
        <ChartTypeIcon type="table" />
        <p>The detailed report table will be shown when you select View.</p>
      </div>
    );
  }

  if (type === "area") {
    if (apiType === "lost-leads") {
      if (categoryData.length === 0) {
        return (
          <div className={styles.chartEmpty}>
            No lost reasons are available for this report and filter range.
          </div>
        );
      }
      return (
        <div className={styles.chartCanvas} role="img" aria-label="Area chart">
          <ResponsiveContainer height="100%" minHeight={280} width="100%">
            <AreaChart
              data={categoryData}
              margin={{ top: 18, right: 24, left: 20, bottom: 24 }}
            >
              <CartesianGrid stroke="#e6ecec" strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                interval={0}
                angle={categoryData.length > 5 ? -25 : 0}
                textAnchor={categoryData.length > 5 ? "end" : "middle"}
                height={categoryData.length > 5 ? 64 : 48}
                label={{
                  value: "Lost Reason",
                  position: "bottom",
                  offset: 2,
                  fill: "#52676e",
                  fontSize: 11,
                }}
                tick={{ fill: "#52676e", fontSize: 11 }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "#52676e", fontSize: 11 }}
                label={{
                  value: "Lead Count",
                  angle: -90,
                  position: "insideLeft",
                  fill: "#52676e",
                  fontSize: 11,
                }}
              />
              <Tooltip />
              <Area
                dataKey="value"
                fill="#ed8f70"
                fillOpacity={0.28}
                name="Lead Count"
                stroke="#ed8f70"
                strokeWidth={3}
                type="monotone"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      );
    }
    if (!supportsTrend(apiType)) {
      return (
        <div className={styles.chartEmpty}>
          This report does not contain historical event data for a trend chart.
        </div>
      );
    }
    if (trend.data.length === 0) {
      return (
        <div className={styles.chartEmpty}>
          No dated records are available for this report and filter range.
        </div>
      );
    }
    return <TrendChart apiType={apiType} trend={trend} />;
  }

  if (categoryData.length === 0) {
    return (
      <div className={styles.chartEmpty}>
        No category data is available for this report and filter range.
      </div>
    );
  }

  if (type === "line") {
    const chartLineData =
      apiType === "monthly-summary" ||
      apiType === "pipeline"
        ? categoryData
        : buildLineCategoryData(apiType, rows);
    const orderedCategories = categoryOrders[apiType];
    const lineData = [...chartLineData].sort((left, right) => {
      if (!orderedCategories) return left.name.localeCompare(right.name);
      const leftIndex = orderedCategories.indexOf(left.name);
      const rightIndex = orderedCategories.indexOf(right.name);
      if (leftIndex < 0 && rightIndex < 0) {
        return left.name.localeCompare(right.name);
      }
      if (leftIndex < 0) return 1;
      if (rightIndex < 0) return -1;
      return leftIndex - rightIndex;
    });
    if (lineData.length === 0) {
      return (
        <div className={styles.chartEmpty}>
          No valid numeric values are available for this line chart.
        </div>
      );
    }
    const isSinglePoint = lineData.length === 1;
    const { minimum, maximum } = lineData.reduce(
      (range, item) => ({
        minimum: Math.min(range.minimum, item.value),
        maximum: Math.max(range.maximum, item.value),
      }),
      { minimum: Number.POSITIVE_INFINITY, maximum: Number.NEGATIVE_INFINITY },
    );
    const span = maximum - minimum;
    const padding =
      span === 0 ? Math.max(Math.abs(maximum) * 0.1, 1) : span * 0.12;
    const lineDomain: [number, number] = [
      apiType === "lost-leads" ? 0 : minimum - padding,
      maximum + padding,
    ];
    const isCurrencyMetric = currencyMetricTypes.has(apiType);

    return (
      <>
        <div className={styles.chartCanvas} role="img" aria-label="Line chart">
          <ResponsiveContainer height="100%" minHeight={280} width="100%">
            <LineChart
              data={lineData}
              margin={{ top: 18, right: 24, left: 20, bottom: 24 }}
            >
              <CartesianGrid
                horizontal
                vertical={false}
                stroke="#e6ecec"
                strokeDasharray="3 3"
              />
              <XAxis
                dataKey="name"
                interval={0}
                angle={lineData.length > 5 ? -25 : 0}
                textAnchor={lineData.length > 5 ? "end" : "middle"}
                height={lineData.length > 5 ? 64 : 48}
                label={{
                  value:
                    apiType === "bde-performance"
                      ? "BDE"
                      : apiType === "monthly-summary"
                        ? "Metric"
                        : apiType === "pipeline"
                          ? "Pipeline Stage"
                          : apiType === "lost-leads"
                            ? "Lost Reason"
                            : apiType === "proposals"
                              ? "Proposal"
                              : apiType === "follow-ups"
                                ? "Lead"
                                : "Lead / Deal",
                  position: "bottom",
                  offset: 2,
                  fill: "#52676e",
                  fontSize: 11,
                }}
                tick={{ fill: "#52676e", fontSize: 11 }}
              />
              <YAxis
                width={72}
                allowDecimals={
                  isCurrencyMetric ||
                  lineData.some((item) => !Number.isInteger(item.value))
                }
                domain={lineDomain}
                tick={{ fill: "#52676e", fontSize: 11 }}
                tickFormatter={(value: number) =>
                  isCurrencyMetric
                    ? new Intl.NumberFormat("en-IN", {
                        notation: "compact",
                        maximumFractionDigits: 1,
                      }).format(value)
                    : String(value)
                }
                label={{
                  value: valueLabel,
                  angle: -90,
                  position: "insideLeft",
                  fill: "#52676e",
                  fontSize: 11,
                }}
              />
              <Tooltip
                labelFormatter={(label) => String(label)}
                formatter={(value) => [
                  isCurrencyMetric
                    ? formatCurrency(String(value))
                    : value,
                  valueLabel,
                ]}
              />
              <Line
                activeDot={{ r: 9, stroke: "#ffffff", strokeWidth: 2 }}
                dataKey="value"
                dot={{
                  r: 7,
                  fill: "#ed8f70",
                  stroke: "#ed8f70",
                  strokeWidth: 2,
                }}
                name={valueLabel}
                stroke="#ed8f70"
                strokeWidth={4}
                type="monotone"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {isSinglePoint && (
          <p className={styles.trendNote} role="status">
            Only one category has data. More categories are needed to show a
            meaningful line.
          </p>
        )}
      </>
    );
  }

  if (type === "pie") {
    if (categoryData.every((category) => category.value <= 0)) {
      return (
        <div className={styles.chartEmpty}>
          No positive category values are available for this report and filter
          range.
        </div>
      );
    }
    const pieData = categoryData.filter((category) => category.value > 0);
    const pieTotal = pieData.reduce((total, category) => total + category.value, 0);
    return (
      <>
        <div
          className={styles.chartCanvas}
          role="img"
          aria-label={`${type} chart`}
        >
          <ResponsiveContainer height="100%" minHeight={280} width="100%">
            <PieChart margin={{ top: 10, right: 18, bottom: 8, left: 18 }}>
              <Tooltip
                formatter={(value, name) => {
                  const numericValue = Number(value);
                  const percentage =
                    pieTotal > 0 ? (numericValue / pieTotal) * 100 : 0;
                  return [
                    `${numericValue.toLocaleString()} (${percentage.toFixed(1)}%)`,
                    String(name),
                  ];
                }}
              />
              <Legend
                align="center"
                height={44}
                verticalAlign="bottom"
                wrapperStyle={{ fontSize: 11 }}
              />
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="43%"
                outerRadius="58%"
                minAngle={4}
                paddingAngle={0}
              >
                {pieData.map((item, index) => (
                  <Cell
                    fill={chartColors[index % chartColors.length]}
                    key={item.name}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <p className={styles.chartFootnote}>
          Small slices are enlarged for visibility. Hover over a slice to see
          its actual value and percentage.
        </p>
      </>
    );
  }

  return (
    <div className={styles.chartCanvas} role="img" aria-label={`${type} chart`}>
      <ResponsiveContainer height="100%" minHeight={280} width="100%">
        {type === "bar" ? (
          <BarChart
            data={categoryData}
            layout={apiType === "lost-leads" ? "horizontal" : "vertical"}
            margin={{
              top: 38,
              right: 20,
              left: 12,
              bottom: apiType === "lost-leads" ? 24 : 14,
            }}
          >
            <Legend
              align="center"
              height={28}
              verticalAlign="top"
              wrapperStyle={{ fontSize: 11 }}
            />
            <CartesianGrid stroke="#e6ecec" strokeDasharray="3 3" />
            <XAxis
              {...(apiType === "lost-leads"
                ? {
                    dataKey: "name",
                    interval: 0 as const,
                    angle: categoryData.length > 5 ? -25 : 0,
                    textAnchor: categoryData.length > 5 ? "end" : "middle",
                    height: categoryData.length > 5 ? 64 : 48,
                    label: {
                      value: "Lost Reason",
                      position: "bottom" as const,
                      offset: 2,
                      fill: "#52676e",
                      fontSize: 11,
                    },
                    tick: { fill: "#52676e", fontSize: 11 },
                  }
                : {
                    allowDecimals: false,
                    tick: { fill: "#52676e", fontSize: 11 },
                    type: "number" as const,
                  })}
            />
            <YAxis
              {...(apiType === "lost-leads"
                ? {
                    allowDecimals: false,
                    tick: { fill: "#52676e", fontSize: 11 },
                    label: {
                      value: "Lead Count",
                      angle: -90 as const,
                      position: "insideLeft" as const,
                      fill: "#52676e",
                      fontSize: 11,
                    },
                  }
                : {
                    dataKey: "name",
                    tick: { fill: "#52676e", fontSize: 11 },
                    type: "category" as const,
                    width: 120,
                  })}
            />
            <Tooltip />
            <Bar
              dataKey="value"
              fill="#ed8f70"
              name={valueLabel}
              radius={
                apiType === "lost-leads" ? [4, 4, 0, 0] : [0, 4, 4, 0]
              }
            />
          </BarChart>
        ) : (
          <BarChart
            data={categoryData}
            margin={{
              top: 38,
              right: 18,
              left: 12,
              bottom: categoryData.length > 4 ? 22 : 8,
            }}
          >
            <Legend
              align="center"
              height={28}
              verticalAlign="top"
              wrapperStyle={{ fontSize: 11 }}
            />
            <CartesianGrid stroke="#e6ecec" strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              interval={0}
              angle={categoryData.length > 4 ? -35 : 0}
              textAnchor={categoryData.length > 4 ? "end" : "middle"}
              height={categoryData.length > 4 ? 78 : 48}
              tickMargin={8}
              tick={{ fill: "#52676e", fontSize: 11 }}
              label={
                apiType === "lost-leads"
                  ? {
                      value: "Lost Reason",
                      position: "bottom",
                      offset: 2,
                      fill: "#52676e",
                      fontSize: 11,
                    }
                  : undefined
              }
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: "#52676e", fontSize: 11 }}
              label={
                apiType === "lost-leads"
                  ? {
                      value: "Lead Count",
                      angle: -90,
                      position: "insideLeft",
                      fill: "#52676e",
                      fontSize: 11,
                    }
                  : undefined
              }
            />
            <Tooltip />
            <Bar
              dataKey="value"
              fill="#ed8f70"
              name={valueLabel}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export function ReportChart({
  apiType,
  rows,
  from,
  to,
  type,
}: ReportChartProps & { type: ReportChartType }) {
  return (
    <ChartDisplay
      apiType={apiType}
      from={from}
      rows={rows}
      to={to}
      type={type}
    />
  );
}

export function ReportChartSelector({
  apiType,
  rows,
  from,
  to,
  appliedType,
  loading,
  error,
  onApply,
}: ReportChartSelectorProps) {
  const [open, setOpen] = useState(false);
  const [pendingType, setPendingType] = useState(appliedType);
  const appliedOption =
    chartOptions.find(({ type }) => type === appliedType) ??
    chartOptions[4];
  const temporalChartsAvailable = supportsTrend(apiType);
  const lineChartsUnavailable = apiType === "follow-ups";
  const tableOnly = apiType === "proposals";

  function isOptionUnavailable(type: ReportChartType) {
    return (
      (tableOnly && type !== "table") ||
      (lineChartsUnavailable && (type === "line" || type === "area")) ||
      (type === "area" && !temporalChartsAvailable)
    );
  }

  function showSelector() {
    setPendingType(
      isOptionUnavailable(appliedType) ? "table" : appliedType,
    );
    setOpen(true);
  }

  function applySelection() {
    if (isOptionUnavailable(pendingType)) return;
    onApply(pendingType);
    setOpen(false);
  }

  return (
    <>
      <button
        aria-haspopup="dialog"
        className={styles.selectorButton}
        onClick={showSelector}
        type="button"
      >
        <ChartTypeIcon type={appliedOption.type} />
        <span>{appliedOption.label}</span>
        <span aria-hidden="true" className={styles.dropdownArrow} />
      </button>
      {open && (
        <div className={styles.overlay}>
          <section
            aria-labelledby="report-chart-title"
            aria-modal="true"
            className={styles.dialog}
            role="dialog"
          >
            <div className={styles.dialogHeader}>
              <h2 id="report-chart-title">Choose visualization</h2>
              <label className={styles.typeSelectLabel}>
                Chart type
                <select
                  onChange={(event) => {
                    const selectedType = event.target.value;
                    if (isReportChartType(selectedType)) {
                      setPendingType(selectedType);
                    }
                  }}
                  value={pendingType}
                >
                  {chartOptions.map((option) => {
                    const unavailable = isOptionUnavailable(option.type);
                    return (
                      <option
                        disabled={unavailable}
                        key={option.type}
                        title={
                          unavailable
                            ? tableOnly
                              ? "Only the table view is available for proposal reports."
                              : lineChartsUnavailable
                              ? "Line and area charts are not available for follow-up reports."
                              : "This report has no suitable event date for an area chart."
                            : undefined
                        }
                        value={option.type}
                      >
                        {option.label}
                        {unavailable ? " (not available)" : ""}
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>
            {loading ? (
              <div className={styles.previewMessage}>Loading report data...</div>
            ) : error ? (
              <div className={styles.previewMessage} role="alert">
                {error}
              </div>
            ) : rows.length === 0 && pendingType !== "table" ? (
              <div className={styles.previewMessage}>
                No records for this report and filter range.
              </div>
            ) : (
              <ChartDisplay
                apiType={apiType}
                from={from}
                rows={rows}
                to={to}
                type={pendingType}
              />
            )}
            <div className={styles.dialogActions}>
              <button
                className={styles.cancelButton}
                onClick={() => setOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className={styles.viewButton}
                disabled={
                  loading || Boolean(error) || isOptionUnavailable(pendingType)
                }
                onClick={applySelection}
                type="button"
              >
                View
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
