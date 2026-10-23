"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiClient, apiClientResponse } from "../../lib/api-client";
import { notify } from "../../lib/notifications";
import { getAuthUser } from "../../lib/auth";
import {
  ReportChart,
  ReportChartSelector,
  type ReportChartType,
} from "./report-visualization";

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
type BdeOption = { id: string; fullName: string };

type ReportPaginationProps = {
  page: number;
  pageSize: number;
  totalRows: number;
  label: string;
  onPageChange: (page: number) => void;
};

function ReportPagination({
  page,
  pageSize,
  totalRows,
  label,
  onPageChange,
}: ReportPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  if (totalPages <= 1) return null;

  const firstRow = (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, totalRows);

  return (
    <nav
      className="pagination report-pagination report-screen-controls"
      aria-label={label}
    >
      <span>
        Showing {firstRow}-{lastRow} of {totalRows}
      </span>
      <div className="pagination-controls">
        <button
          className="secondary-action"
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          Previous
        </button>
        <strong>
          {page} / {totalPages}
        </strong>
        <button
          className="secondary-action"
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
        >
          Next
        </button>
      </div>
    </nav>
  );
}

const reportTypes = [
  {
    slug: "bde-performance",
    title: "BDE Performance Report",
    description:
      "BDE-wise leads, activities, follow-ups, meetings, proposals, won, lost, and revenue.",
    apiType: "bde-performance",
  },
  {
    slug: "lead-report",
    title: "Lead Report",
    description: "Lead details; the selected period is based on lead creation date.",
    apiType: "leads",
  },
  {
    slug: "revenue-report",
    title: "Revenue Report",
    description: "Revenue details from won deals in the selected period.",
    apiType: "revenue",
  },
  {
    slug: "pipeline-report",
    title: "Pipeline Report",
    description: "Open leads organized by current pipeline stage.",
    apiType: "pipeline",
  },
  {
    slug: "follow-up-report",
    title: "Follow-up Report",
    description: "Today's, upcoming, overdue, and completed follow-ups.",
    apiType: "follow-ups",
  },
  {
    slug: "proposal-report",
    title: "Proposal Report",
    description: "Proposal details linked to their lead and assigned BDE.",
    apiType: "proposals",
  },
  {
    slug: "lost-lead-report",
    title: "Lost Lead Report",
    description: "Lost opportunities grouped by their recorded reason.",
    apiType: "lost-leads",
  },
] as const;

const pipelineStages = [
  "NEW_LEAD",
  "CONTACTED",
  "INTERESTED",
  "MEETING",
  "PROPOSAL",
  "NEGOTIATION",
] as const;

const reportAccessStorageKey = (userId: string | undefined) =>
  `durozen_report_last_accessed:${userId ?? "anonymous"}`;

function readReportAccessTimes(userId: string | undefined) {
  try {
    const stored = window.localStorage.getItem(reportAccessStorageKey(userId));
    const parsed: unknown = stored ? JSON.parse(stored) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, value]) =>
          typeof value === "string" && !Number.isNaN(Date.parse(value)),
      ),
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

function formatReportAccessTime(value: string | undefined, now: number) {
  if (!value) return "—";
  const accessedAt = new Date(value);
  const elapsedMinutes = Math.max(
    0,
    Math.floor((now - accessedAt.getTime()) / 60_000),
  );
  if (elapsedMinutes < 1) return "now";
  if (elapsedMinutes < 60)
    return `${elapsedMinutes} min${elapsedMinutes === 1 ? "" : "s"} ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24)
    return `${elapsedHours} hr${elapsedHours === 1 ? "" : "s"} ago`;
  return `${String(accessedAt.getDate()).padStart(2, "0")}/${String(
    accessedAt.getMonth() + 1,
  ).padStart(2, "0")}/${accessedAt.getFullYear()}`;
}

type ReportColumn = {
  key: string;
  label: string;
  format?: "date" | "money" | "number" | "percent";
};

const reportColumns: Record<string, ReportColumn[]> = {
  leads: [
    { key: "customerName", label: "Lead Name" },
    { key: "businessName", label: "Company" },
    { key: "contactInformation", label: "Contact Information" },
    { key: "leadSource", label: "Lead Source" },
    { key: "assignedBde.fullName", label: "Assigned BDE" },
    { key: "stage", label: "Current Stage" },
    { key: "createdAt", label: "Created Date", format: "date" },
    { key: "followUpAt", label: "Next Follow-up", format: "date" },
  ],
  "bde-performance": [
    { key: "name", label: "BDE Name" },
    { key: "totalLeads", label: "Total Leads", format: "number" },
    { key: "contacted", label: "Contacted Leads", format: "number" },
    { key: "interested", label: "Interested Leads", format: "number" },
    {
      key: "followUpsCompleted",
      label: "Follow-ups Completed",
      format: "number",
    },
    {
      key: "overdueFollowUps",
      label: "Overdue Follow-ups",
      format: "number",
    },
    { key: "meetings", label: "Meetings", format: "number" },
    { key: "proposals", label: "Proposals", format: "number" },
    { key: "won", label: "Won Deals", format: "number" },
    { key: "lost", label: "Lost Deals", format: "number" },
    { key: "revenue", label: "Revenue Generated", format: "money" },
  ],
  pipeline: [
    { key: "customerName", label: "Lead Name" },
    { key: "businessName", label: "Company" },
    { key: "assignedBde.fullName", label: "Assigned BDE" },
    { key: "stage", label: "Pipeline Stage" },
    { key: "leadSource", label: "Lead Source" },
    { key: "estimatedBudget", label: "Expected Deal Value", format: "money" },
    { key: "lastActivityAt", label: "Last Activity Date", format: "date" },
    { key: "followUpAt", label: "Next Follow-up", format: "date" },
    { key: "daysInCurrentStage", label: "Days in Stage", format: "number" },
  ],
  "lead-aging": [
    { key: "customerName", label: "Lead Name" },
    { key: "businessName", label: "Company" },
    { key: "assignedBde.fullName", label: "Assigned BDE" },
    { key: "stage", label: "Current Stage" },
    { key: "daysInCurrentStage", label: "Days in Stage", format: "number" },
    { key: "lastActivityAt", label: "Last Activity Date", format: "date" },
    { key: "followUpAt", label: "Next Follow-up", format: "date" },
  ],
  "follow-ups": [
    { key: "lead.customerName", label: "Lead Name" },
    { key: "lead.businessName", label: "Company" },
    { key: "lead.assignedBde.fullName", label: "Assigned BDE" },
    { key: "dueAt", label: "Follow-up Date", format: "date" },
    { key: "type", label: "Follow-up Type" },
    { key: "status", label: "Status" },
    { key: "nextAction", label: "Next Action" },
    { key: "latestActivity", label: "Last Activity / Notes" },
  ],
  proposals: [
    { key: "lead.leadNumber", label: "Lead Number" },
    { key: "lead.customerName", label: "Lead / Company" },
    { key: "lead.assignedBde.fullName", label: "Assigned BDE" },
    { key: "proposalDate", label: "Proposal Date", format: "date" },
    { key: "finalAmount", label: "Proposal Value", format: "money" },
    { key: "negotiatedAmount", label: "Negotiated Amount", format: "money" },
  ],
  "won-lost": [
    { key: "customerName", label: "Lead / Deal" },
    { key: "businessName", label: "Company" },
    { key: "assignedBde.fullName", label: "Assigned BDE" },
    { key: "stage", label: "Final Outcome" },
    { key: "stageEnteredAt", label: "Outcome Date", format: "date" },
    { key: "finalDealValue", label: "Deal Value", format: "money" },
    { key: "lostReason", label: "Lost Reason" },
  ],
  revenue: [
    { key: "stageEnteredAt", label: "Won Date", format: "date" },
    { key: "customerName", label: "Won Deal / Lead" },
    { key: "businessName", label: "Company" },
    { key: "assignedBde.fullName", label: "Assigned BDE" },
    { key: "finalDealValue", label: "Revenue", format: "money" },
  ],
  "lost-leads": [
    { key: "customerName", label: "Lead / Deal" },
    { key: "businessName", label: "Company" },
    { key: "assignedBde.fullName", label: "Assigned BDE" },
    { key: "stageEnteredAt", label: "Lost Date", format: "date" },
    { key: "lostReason", label: "Lost Reason / Category" },
    { key: "finalDealValue", label: "Deal Value", format: "money" },
  ],
  "monthly-summary": [
    { key: "month", label: "Period" },
    { key: "totalLeads", label: "Total Leads", format: "number" },
    { key: "contacted", label: "Contacted Leads", format: "number" },
    { key: "interested", label: "Interested Leads", format: "number" },
    { key: "meetings", label: "Meetings", format: "number" },
    { key: "proposals", label: "Proposals", format: "number" },
    { key: "negotiations", label: "Negotiations", format: "number" },
    { key: "won", label: "Won Deals", format: "number" },
    { key: "lost", label: "Lost Deals", format: "number" },
    { key: "revenue", label: "Revenue", format: "money" },
    { key: "conversionRate", label: "Conversion Rate", format: "percent" },
  ],
};

const money = (value: string | number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
const localDate = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const oneMonthBefore = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  const targetMonth = new Date(year, month - 2, 1);
  const lastDay = new Date(
    targetMonth.getFullYear(),
    targetMonth.getMonth() + 1,
    0,
  ).getDate();
  return localDate(
    new Date(
      targetMonth.getFullYear(),
      targetMonth.getMonth(),
      Math.min(day, lastDay),
    ),
  );
};

function reportValue(
  row: ReportRow,
  key: string,
): unknown {
  if (key === "contactInformation") {
    return [row.mobileNumber, row.email].filter(Boolean).join(" · ") || null;
  }
  if (key === "negotiatedAmount") {
    const lead = row.lead as ReportRow | undefined;
    const negotiations = lead?.negotiations as ReportRow[] | undefined;
    return negotiations?.[0]?.negotiatedAmount ?? "-";
  }
  if (key === "latestActivity") {
    const lead = row.lead as ReportRow | undefined;
    const activities = lead?.activities as ReportRow[] | undefined;
    return row.remarks ?? activities?.[0]?.description ?? null;
  }
  return key.split(".").reduce<unknown>((value, part) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as ReportRow)[part];
  }, row);
}

function formatReportValue(value: unknown, format?: ReportColumn["format"]) {
  if (value === null || value === undefined || value === "") return "—";
  if (value === "-") return "-";
  if (format === "date") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime())
      ? String(value)
      : new Intl.DateTimeFormat("en-IN").format(date);
  }
  if (format === "money") return money(String(value));
  if (format === "percent") return `${String(value)}%`;
  return String(value);
}

async function downloadReport(
  type: string,
  format: "pdf" | "xlsx",
  filters: Record<string, string>,
) {
  const query = new URLSearchParams({
    format,
    ...filters,
  });
  const response = await apiClientResponse(`/exports/${type}?${query}`);
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
  const canExport = getAuthUser()?.role === "ADMIN";
  useEffect(() => {
    apiClient<MonthlySummary>(`/reports/monthly-summary?month=${month}`)
      .then(setData)
      .catch((reason: unknown) => {
        const message =
          reason instanceof Error
            ? reason.message
            : "Unable to load monthly summary.";
        setError(message);
        notify(message, "error");
      });
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
        { from: `${month}-01`, to: localDate(nextMonth) },
      );
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : "Unable to export monthly summary.";
      setError(message);
      notify(message, "error");
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
  const user = getAuthUser();
  const today = new Date();
  const [from, setFrom] = useState(
    localDate(new Date(today.getFullYear(), today.getMonth(), 1)),
  );
  const [to, setTo] = useState(localDate(today));
  const [rows, setRows] = useState<BdeMetrics[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    setError("");
    apiClient<{ bdes: BdeMetrics[] }>(`/performance?from=${from}&to=${to}`)
      .then((result) => setRows(result.bdes))
      .catch((reason: unknown) => {
        setRows([]);
        const message =
          reason instanceof Error
            ? reason.message
            : "Unable to load performance.";
        setError(message);
        notify(message, "error");
      })
      .finally(() => setLoading(false));
  }, [from, to]);
  return (
    <main className="lead-workspace report-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">
            {user?.role === "BDE" ? "MY RESULTS" : "TEAM RESULTS"}
          </p>
          <h1>{user?.role === "BDE" ? "My performance" : "BDE performance"}</h1>
          <p className="subtitle">
            {user?.role === "BDE"
              ? "Your lead handling, sales activity, follow-ups, and won revenue."
              : "Lead handling, sales activity, follow-ups, and won revenue."}
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
      <div className="lead-table-wrap">
        {loading && (
          <p className="dashboard-loading">Loading BDE performance...</p>
        )}
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
        {!loading && !error && rows.length === 0 && (
          <div className="empty-list">No BDE performance for this period.</div>
        )}
      </div>
      {user?.role !== "BDE" && (
        <div className="report-shortcuts">
          <Link href="/reports">Open reports</Link>
        </div>
      )}
    </main>
  );
}

export function ReportsWorkspace() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [lastAccessed, setLastAccessed] = useState<Record<string, string>>({});
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const pageSize = 10;
  const userId = getAuthUser()?.id;
  const filteredReports = reportTypes.filter((report) =>
    `${report.title} ${report.description}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  const totalPages = Math.max(1, Math.ceil(filteredReports.length / pageSize));
  const visibleReports = filteredReports.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  useEffect(() => {
    const refreshAccessTimes = () => {
      setLastAccessed(readReportAccessTimes(userId));
      setCurrentTime(Date.now());
    };
    refreshAccessTimes();
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    window.addEventListener("storage", refreshAccessTimes);
    window.addEventListener("durozen-report-access-updated", refreshAccessTimes);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", refreshAccessTimes);
      window.removeEventListener(
        "durozen-report-access-updated",
        refreshAccessTimes,
      );
    };
  }, [userId]);

  return (
    <main className="lead-workspace report-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">MANAGEMENT INSIGHTS</p>
          <h1>Reports</h1>
          <p className="subtitle">Select a report to view its CRM data.</p>
        </div>
        <input
          aria-label="Search reports"
          className="reports-list-search"
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search reports"
          type="search"
          value={search}
        />
      </header>
      <div className="lead-table-wrap report-table-wrap reports-list-wrap">
        <table className="lead-table reports-list-table">
          <colgroup>
            <col className="reports-name-column" />
            <col className="reports-description-column" />
            <col className="reports-accessed-column" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Report Name</th>
              <th scope="col">Description</th>
              <th scope="col">Last Accessed</th>
            </tr>
          </thead>
          <tbody>
            {visibleReports.map((report) => (
              <tr
                aria-label={`Open ${report.title}`}
                key={report.slug}
                onClick={() => router.push(`/reports/${report.slug}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(`/reports/${report.slug}`);
                  }
                }}
                role="link"
                tabIndex={0}
              >
                <td>{report.title}</td>
                <td title={report.description}>{report.description}</td>
                <td>
                  {formatReportAccessTime(lastAccessed[report.slug], currentTime)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredReports.length === 0 && (
          <div className="empty-list">No reports found</div>
        )}
      </div>
      <ReportPagination
        page={page}
        pageSize={pageSize}
        totalRows={filteredReports.length}
        label="Reports pages"
        onPageChange={(nextPage) =>
          setPage(Math.min(totalPages, Math.max(1, nextPage)))
        }
      />
    </main>
  );
}

export function ReportDetailWorkspace() {
  const params = useParams<{ type: string }>();
  const report = reportTypes.find(({ slug }) => slug === params.type);
  const [from, setFrom] = useState(() => {
    return oneMonthBefore(localDate(new Date()));
  });
  const [to, setTo] = useState(() => localDate(new Date()));
  const [stage, setStage] = useState("");
  const [followUpCategory, setFollowUpCategory] = useState("");
  const [followUpStatus, setFollowUpStatus] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [assignedBdeId, setAssignedBdeId] = useState("");
  const [bdeOptions, setBdeOptions] = useState<BdeOption[]>([]);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [chartType, setChartType] = useState<ReportChartType>("table");
  const [exportFormat, setExportFormat] = useState<"pdf" | "xlsx" | "print">(
    "pdf",
  );
  const user = getAuthUser();
  const restricted =
    user?.role === "BDE" &&
    report !== undefined &&
    ![
      "bde-performance",
      "follow-up-report",
    ].includes(report.slug);

  useEffect(() => {
    setChartType("table");
  }, [report?.apiType]);

  useEffect(() => {
    if (!report || restricted) return;
    const key = reportAccessStorageKey(user?.id);
    const accessTimes = readReportAccessTimes(user?.id);
    accessTimes[report.slug] = new Date().toISOString();
    window.localStorage.setItem(key, JSON.stringify(accessTimes));
    window.dispatchEvent(new Event("durozen-report-access-updated"));
  }, [report, restricted, user?.id]);

  const filters = useMemo(
    () => ({
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(assignedBdeId && user?.role !== "BDE" ? { assignedBdeId } : {}),
      ...(stage &&
      ["leads", "pipeline"].includes(report?.apiType ?? "")
        ? { stage }
        : {}),
      ...(followUpCategory && report?.apiType === "follow-ups"
        ? { category: followUpCategory }
        : {}),
      ...(followUpStatus && report?.apiType === "follow-ups"
        ? { status: followUpStatus }
        : {}),
      ...(lostReason && report?.apiType === "lost-leads"
        ? { lostReason }
        : {}),
    }),
    [
      followUpCategory,
      followUpStatus,
      from,
      assignedBdeId,
      lostReason,
      report,
      stage,
      to,
      user?.role,
    ],
  );

  useEffect(() => {
    setPage(1);
  }, [filters, report]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!report || user?.role === "BDE") {
      setBdeOptions([]);
      return;
    }
    let cancelled = false;
    apiClient<BdeOption[]>("/reports/bde-options")
      .then((options) => {
        if (!cancelled) setBdeOptions(options);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        const message =
          reason instanceof Error
            ? reason.message
            : "Unable to load BDE filters.";
        notify(message, "error");
      });
    return () => {
      cancelled = true;
    };
  }, [report, user?.role]);

  useEffect(() => {
    if (!report || restricted) {
      setRows([]);
      setLoading(false);
      return;
    }

    const activeReport = report;
    let cancelled = false;
    async function loadReport() {
      setLoading(true);
      setError("");
      setRows([]);
      try {
        const query = new URLSearchParams({
          ...filters,
        });
        const data = await apiClient<ReportRow[]>(
          `/reports/${activeReport.apiType}?${query}`,
        );
        if (!cancelled) setRows(data);
      } catch (reason: unknown) {
        if (cancelled) return;
        setRows([]);
        const message =
          reason instanceof Error
            ? reason.message
            : "Unable to load this report.";
        setError(message);
        notify(message, "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadReport();
    return () => {
      cancelled = true;
    };
  }, [
    filters,
    report,
    restricted,
  ]);

  async function exportFile() {
    if (!report) return;
    if (exportFormat === "print") {
      setExportDialogOpen(false);
      window.print();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await downloadReport(report.apiType, exportFormat, filters);
      setExportDialogOpen(false);
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "Unable to export report.";
      setError(message);
      notify(message, "error");
    } finally {
      setBusy(false);
    }
  }

  if (!report) {
    return (
      <main className="lead-workspace report-workspace">
        <section className="panel report-restricted">
          <h2>Report not found</h2>
          <p>
            <Link href="/reports">Return to Reports</Link>
          </p>
        </section>
      </main>
    );
  }

  if (restricted) {
    return (
      <main className="lead-workspace report-workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">MANAGEMENT INSIGHTS</p>
            <h1>{report.title}</h1>
          </div>
        </header>
        <section className="panel report-restricted">
          <h2>Management reports are restricted</h2>
          <p>
            Your own results are available in{" "}
            <Link href="/reports/bde-performance">BDE Performance</Link>.
          </p>
        </section>
      </main>
    );
  }

  const columns = reportColumns[report.apiType] ?? [];
  const canExport = user?.role === "ADMIN";
  const summaryMetrics =
    report.apiType === "revenue"
      ? [
          ["Won deals", rows.length],
          [
            "Total revenue",
            money(
              rows.reduce(
                (sum, row) => sum + Number(row.finalDealValue ?? 0),
                0,
              ),
            ),
          ],
        ]
      : report.apiType === "lost-leads"
        ? [["Lost leads", rows.length]]
        : [];
  const pipelineStageCounts =
    report.apiType === "pipeline"
      ? pipelineStages.map((stage) => ({
          stage,
          count: rows.filter((row) => row.stage === stage).length,
        }))
      : [];

  return (
    <main
      className="lead-workspace report-workspace report-print-area"
      data-print-orientation={columns.length > 6 ? "landscape" : "portrait"}
    >
      <header className="workspace-header">
        <div>
          <p className="eyebrow">MANAGEMENT INSIGHTS</p>
          <h1>{report.title}</h1>
          <p className="subtitle">{report.description}</p>
          <p className="report-print-meta">
            {`Date range: ${from || "Any"} to ${to || "Any"}`}
            {assignedBdeId
              ? ` · BDE: ${bdeOptions.find((option) => option.id === assignedBdeId)?.fullName ?? assignedBdeId}`
              : ""}
            {stage ? ` · Stage: ${stage}` : ""}
            {followUpCategory
              ? ` · Follow-up: ${followUpCategory}`
              : ""}
            {followUpStatus ? ` · Status: ${followUpStatus}` : ""}
            {report.apiType === "lost-leads" && lostReason
              ? ` · Lost reason: ${lostReason}`
              : ""}
          </p>
        </div>
      </header>
      <div className="report-toolbar report-screen-controls">
        <div>
          <Link className="secondary-action" href="/reports">
            All reports
          </Link>
          {bdeOptions.length > 0 && (
            <label>
              BDE
              <select
                onChange={(event) => setAssignedBdeId(event.target.value)}
                value={assignedBdeId}
              >
                <option value="">All BDEs</option>
                {bdeOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.fullName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="date-range-controls report-date-range">
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
          {["leads", "pipeline"].includes(report.apiType) && (
            <label>
              Stage
              <select
                onChange={(event) => setStage(event.target.value)}
                value={stage}
              >
                <option value="">All stages</option>
                {(report.apiType === "leads"
                  ? [
                      "NEW_LEAD",
                      "CONTACTED",
                      "INTERESTED",
                      "MEETING",
                      "PROPOSAL",
                      "NEGOTIATION",
                      "WON",
                      "LOST",
                    ]
                  : [
                      "NEW_LEAD",
                      "CONTACTED",
                      "INTERESTED",
                      "MEETING",
                      "PROPOSAL",
                      "NEGOTIATION",
                    ]
                ).map((option) => (
                  <option key={option} value={option}>
                    {option.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
          )}
          {report.apiType === "follow-ups" && (
            <>
              <label>
                Follow-up
                <select
                  onChange={(event) => setFollowUpCategory(event.target.value)}
                  value={followUpCategory}
                >
                  <option value="">All follow-ups</option>
                  <option value="today">Today</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="overdue">Overdue</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
              <label>
                Status
                <select
                  onChange={(event) => setFollowUpStatus(event.target.value)}
                  value={followUpStatus}
                >
                  <option value="">All statuses</option>
                  {["PENDING", "COMPLETED", "RESCHEDULED", "CANCELLED"].map(
                    (option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ),
                  )}
                </select>
              </label>
            </>
          )}
          {report.apiType === "lost-leads" && (
            <label>
              Lost reason
              <input
                onChange={(event) => setLostReason(event.target.value)}
                placeholder="Filter lost reason"
                type="search"
                value={lostReason}
              />
            </label>
          )}
        </div>
        <div>
          <ReportChartSelector
            apiType={report.apiType}
            appliedType={chartType}
            error={error}
            from={from}
            loading={loading}
            onApply={setChartType}
            rows={rows}
            to={to}
          />
          <button
            disabled={busy}
            onClick={() => {
              setExportFormat(canExport ? "pdf" : "print");
              setExportDialogOpen(true);
            }}
            type="button"
          >
            Export
          </button>
        </div>
      </div>
      {exportDialogOpen && (
        <div className="report-export-overlay">
          <section
            aria-labelledby="report-export-title"
            aria-modal="true"
            className="panel report-export-dialog"
            role="dialog"
          >
            <h2 id="report-export-title">Choose file format</h2>
            <div className="report-export-formats">
              {canExport && (
                <>
                  <label>
                    <input
                      checked={exportFormat === "pdf"}
                      name="report-export-format"
                      onChange={() => setExportFormat("pdf")}
                      type="radio"
                      value="pdf"
                    />
                    PDF
                  </label>
                  <label>
                    <input
                      checked={exportFormat === "xlsx"}
                      name="report-export-format"
                      onChange={() => setExportFormat("xlsx")}
                      type="radio"
                      value="xlsx"
                    />
                    Excel
                  </label>
                </>
              )}
              <label>
                <input
                  checked={exportFormat === "print"}
                  name="report-export-format"
                  onChange={() => setExportFormat("print")}
                  type="radio"
                  value="print"
                />
                Print
              </label>
            </div>
            <div className="report-export-actions">
              <button
                className="secondary-action"
                onClick={() => setExportDialogOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                disabled={busy}
                onClick={() => void exportFile()}
                type="button"
              >
                {busy ? "Exporting..." : "Export"}
              </button>
            </div>
          </section>
        </div>
      )}
      {summaryMetrics.length > 0 && (
        <div className="summary-metrics report-summary-metrics">
          {summaryMetrics.map(([label, value]) => (
            <article className="summary-metric" key={String(label)}>
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
      )}
      {report.apiType === "pipeline" && !loading && !error && (
        <section
          aria-label="Pipeline leads by stage"
          className="pipeline-stage-summary"
        >
          <h2>Leads by stage</h2>
          <div className="summary-metrics pipeline-stage-metrics">
            {pipelineStageCounts.map(({ stage, count }) => (
              <article className="summary-metric" key={stage}>
                <span>{stage.replaceAll("_", " ")}</span>
                <strong>{count}</strong>
              </article>
            ))}
          </div>
        </section>
      )}
      {loading && <p className="dashboard-loading">Loading report data...</p>}
      {chartType === "table" ? (
        <>
          <div className="lead-table-wrap report-table-wrap">
            <table className="lead-table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => (
                  <tr key={String(row.id ?? row.userId ?? index)}>
                    {columns.map((column) => {
                      const value = reportValue(row, column.key);
                      const title = String(value ?? "");
                      if (
                        report.apiType === "leads" &&
                        column.key === "customerName" &&
                        typeof row.id === "string"
                      ) {
                        return (
                          <td key={column.key} title={title}>
                            <Link
                              href={`/reports/lead-report/${row.id}`}
                              title={`View activity for ${String(row.customerName ?? "lead")}`}
                            >
                              {formatReportValue(value, column.format)}
                            </Link>
                          </td>
                        );
                      }
                      return (
                        <td key={column.key} title={title}>
                          {report.apiType === "proposals" &&
                          column.key === "nextAction" &&
                          value === ""
                            ? ""
                            : formatReportValue(value, column.format)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !error && rows.length === 0 && (
              <div className="empty-list">No records for this report.</div>
            )}
            {error && <div className="empty-list">{error}</div>}
          </div>
          <ReportPagination
            page={page}
            pageSize={pageSize}
            totalRows={rows.length}
            label={`${report.title} pages`}
            onPageChange={(nextPage) =>
              setPage(Math.min(totalPages, Math.max(1, nextPage)))
            }
          />
        </>
      ) : loading || error ? (
        error ? (
          <div className="empty-list">{error}</div>
        ) : null
      ) : rows.length === 0 ? (
        <div className="empty-list">No records for this report.</div>
      ) : (
        <ReportChart
          apiType={report.apiType}
          from={from}
          rows={rows}
          to={to}
          type={chartType}
        />
      )}
    </main>
  );
}
