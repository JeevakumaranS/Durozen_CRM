"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiClient } from "../../lib/api-client";
import { getAccessToken, getAuthUser } from "../../lib/auth";

type MonthlySummary = {
  month: string;
  totalLeads: number;
  contacted: number;
  interested: number;
  meetings: number;
  proposals: number;
  negotiations: number;
  won: number;
  lost: number;
  revenue: string;
  conversionRate: number;
};
type BdeMetrics = {
  userId: string;
  name: string;
  totalLeads: number;
  contacted: number;
  interested: number;
  meetings: number;
  proposals: number;
  negotiations: number;
  won: number;
  lost: number;
  followUpsCompleted: number;
  overdueFollowUps: number;
  revenue: string;
};
type ReportRow = Record<string, unknown>;

const reportTypes = [
  ["leads", "Lead report"],
  ["pipeline", "Pipeline report"],
  ["follow-ups", "Follow-up report"],
  ["proposals", "Proposal report"],
  ["meetings", "Meeting report"],
  ["negotiations", "Negotiation report"],
  ["won-lost", "Won / lost report"],
  ["revenue", "Revenue report"],
  ["lost-leads", "Lost lead analysis"],
  ["bde-performance", "BDE performance report"],
  ["monthly-summary", "Monthly summary"],
] as const;

const money = (value: string | number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value));
const localDate = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

function flatten(value: unknown, prefix = ""): ReportRow {
  if (!value || typeof value !== "object" || value instanceof Date)
    return prefix
      ? { [prefix]: value instanceof Date ? value.toLocaleString() : value }
      : {};
  if (Array.isArray(value)) return prefix ? { [prefix]: value.length } : {};
  const output: ReportRow = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "activities" || key === "followUps") continue;
    const label = prefix ? `${prefix} ${key}` : key;
    if (child && typeof child === "object" && !(child instanceof Date))
      Object.assign(output, flatten(child, label));
    else output[label] = child instanceof Date ? child.toLocaleString() : child;
  }
  return output;
}

async function downloadReport(
  type: string,
  format: "pdf" | "xlsx",
  from: string,
  to: string,
) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
  const query = new URLSearchParams({
    format,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });
  const response = await fetch(`${apiUrl}/exports/${type}?${query}`, {
    headers: { Authorization: `Bearer ${getAccessToken() ?? ""}` },
  });
  if (!response.ok) throw new Error(await response.text());
  const file = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = file;
  anchor.download = `${type}.${format}`;
  anchor.click();
  URL.revokeObjectURL(file);
}

export function MonthlySummaryWorkspace() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<MonthlySummary | null>(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const canExport = getAuthUser()?.role !== "BDE";
  useEffect(() => {
    apiClient<MonthlySummary>(`/reports/monthly-summary?month=${month}`)
      .then(setData)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load monthly summary.",
        ),
      );
  }, [month]);
  async function exportSummary(format: "pdf" | "xlsx") {
    setExporting(true);
    setError("");
    const nextMonth = new Date(`${month}-01T00:00:00`);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(0);
    try {
      await downloadReport(
        "monthly-summary",
        format,
        `${month}-01`,
        localDate(nextMonth),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to export monthly summary.",
      );
    } finally {
      setExporting(false);
    }
  }
  const metrics = data
    ? [
        ["Monthly leads", data.totalLeads],
        ["Contacted", data.contacted],
        ["Interested", data.interested],
        ["Meetings", data.meetings],
        ["Proposals", data.proposals],
        ["Negotiations", data.negotiations],
        ["Won", data.won],
        ["Lost", data.lost],
        ["Revenue", money(data.revenue)],
        ["Conversion", `${data.conversionRate}%`],
      ]
    : [];
  return (
    <main className="lead-workspace report-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">MONTHLY REVIEW</p>
          <h1>Monthly summary</h1>
          <p className="subtitle">
            Stage movement and revenue for the selected month.
          </p>
        </div>
        <label className="period-control">
          Month
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </label>
        {canExport && (
          <div className="summary-export">
            <button
              disabled={exporting}
              onClick={() => void exportSummary("pdf")}
            >
              ↓ PDF
            </button>
            <button
              disabled={exporting}
              onClick={() => void exportSummary("xlsx")}
            >
              ↓ Excel
            </button>
          </div>
        )}
      </header>
      {error && (
        <div className="workspace-notice" role="alert">
          {error}
        </div>
      )}
      {!data && !error && (
        <p className="dashboard-loading">Loading monthly summary...</p>
      )}
      {data && (
        <>
          <div className="summary-metrics">
            {metrics.map(([label, value]) => (
              <article className="summary-metric" key={String(label)}>
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>
          <section className="panel monthly-note">
            <h2>
              {new Intl.DateTimeFormat("en-IN", {
                month: "long",
                year: "numeric",
              }).format(new Date(`${month}-01`))}
            </h2>
            <p>
              Conversion rate is won deals divided by leads created in this
              period.
            </p>
          </section>
        </>
      )}
    </main>
  );
}

export function PerformanceWorkspace() {
  const today = new Date();
  const [from, setFrom] = useState(
    localDate(new Date(today.getFullYear(), today.getMonth(), 1)),
  );
  const [to, setTo] = useState(localDate(today));
  const [rows, setRows] = useState<BdeMetrics[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    apiClient<{ bdes: BdeMetrics[] }>(`/performance?from=${from}&to=${to}`)
      .then((result) => setRows(result.bdes))
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load performance.",
        ),
      );
  }, [from, to]);
  return (
    <main className="lead-workspace report-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">TEAM RESULTS</p>
          <h1>BDE performance</h1>
          <p className="subtitle">
            Lead handling, sales activity, follow-ups, and won revenue.
          </p>
        </div>
        <div className="date-range-controls">
          <label>
            From
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
        </div>
      </header>
      {error && (
        <div className="workspace-notice" role="alert">
          {error}
        </div>
      )}
      <div className="lead-table-wrap">
        <table className="lead-table performance-table">
          <thead>
            <tr>
              <th>BDE</th>
              <th>Leads</th>
              <th>Contacted</th>
              <th>Interested</th>
              <th>Meetings</th>
              <th>Proposals</th>
              <th>Negotiations</th>
              <th>Won</th>
              <th>Lost</th>
              <th>Follow-ups done</th>
              <th>Overdue</th>
              <th>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId}>
                <td>{row.name}</td>
                <td>{row.totalLeads}</td>
                <td>{row.contacted}</td>
                <td>{row.interested}</td>
                <td>{row.meetings}</td>
                <td>{row.proposals}</td>
                <td>{row.negotiations}</td>
                <td>{row.won}</td>
                <td>{row.lost}</td>
                <td>{row.followUpsCompleted}</td>
                <td>{row.overdueFollowUps}</td>
                <td>{money(row.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="empty-list">No BDE performance for this period.</div>
        )}
      </div>
      <div className="report-shortcuts">
        <Link href="/reports">Open reports</Link>
        <Link href="/monthly-summary">Monthly summary</Link>
      </div>
    </main>
  );
}

export function ReportsWorkspace() {
  const [type, setType] = useState<(typeof reportTypes)[number][0]>("leads");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const user = getAuthUser();
  const restricted = user?.role === "BDE";

  useEffect(() => {
    if (restricted) return;
    const query = new URLSearchParams({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    });
    apiClient<ReportRow[]>(`/reports/${type}?${query}`)
      .then(setRows)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load this report.",
        ),
      );
  }, [type, from, to, restricted]);

  async function exportFile(format: "pdf" | "xlsx") {
    setBusy(true);
    setError("");
    try {
      await downloadReport(type, format, from, to);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to export report.",
      );
    } finally {
      setBusy(false);
    }
  }

  const flatRows = rows.map((row) => flatten(row));
  const columns = [...new Set(flatRows.flatMap((row) => Object.keys(row)))]
    .filter((column) => column !== "id")
    .slice(0, 12);
  return (
    <main className="lead-workspace report-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">MANAGEMENT INSIGHTS</p>
          <h1>Reports</h1>
          <p className="subtitle">
            Review CRM records by date and export the selected dataset.
          </p>
        </div>
        <div className="date-range-controls">
          <label>
            From
            <input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
        </div>
      </header>
      {restricted ? (
        <section className="panel report-restricted">
          <h2>Management reports are restricted</h2>
          <p>
            Your own results are available in{" "}
            <Link href="/performance">BDE performance</Link>.
          </p>
        </section>
      ) : (
        <>
          <div className="report-toolbar">
            <label>
              Report
              <select
                value={type}
                onChange={(event) => setType(event.target.value as typeof type)}
              >
                {reportTypes.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <button disabled={busy} onClick={() => void exportFile("pdf")}>
                ↓ PDF
              </button>
              <button disabled={busy} onClick={() => void exportFile("xlsx")}>
                ↓ Excel
              </button>
              <button onClick={() => window.print()}>Print</button>
            </div>
          </div>
          {error && (
            <div className="workspace-notice" role="alert">
              {error}
            </div>
          )}
          <div className="lead-table-wrap report-table-wrap">
            <table className="lead-table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column}>{column.replaceAll("_", " ")}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {flatRows.map((row, index) => (
                  <tr key={String(row.id ?? index)}>
                    {columns.map((column) => (
                      <td key={column}>
                        {row[column] === null || row[column] === undefined
                          ? "—"
                          : String(row[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && (
              <div className="empty-list">
                No records for this report and date range.
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
