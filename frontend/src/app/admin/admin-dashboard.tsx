"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, apiClient, logoutAndRedirect } from "../../lib/api-client";
import { clearAccessToken } from "../../lib/auth";

export type AdminProfile = {
  id: string;
  fullName: string;
  email: string;
  role: "ADMIN";
  isActive: boolean;
  createdAt: string;
};

type Overview = {
  metrics: Record<string, number>;
  revenue: { today: string; week: string; month: string; pipeline: string };
  pipeline: { stage: string; count: number; value: string }[];
};

type Performance = {
  bdes: {
    userId: string;
    name: string;
    totalLeads: number;
    meetings: number;
    proposals: number;
    negotiations: number;
    won: number;
    lost: number;
    followUpsCompleted: number;
    overdueFollowUps: number;
    revenue: string;
  }[];
};

type ReportRow = Record<string, unknown>;
const reportTypes = [
  ["leads", "Leads"],
  ["pipeline", "Pipeline"],
  ["follow-ups", "Follow-ups"],
  ["proposals", "Proposals"],
  ["meetings", "Meetings"],
  ["negotiations", "Negotiations"],
  ["won-lost", "Won / lost"],
  ["revenue", "Revenue"],
  ["lost-leads", "Lost leads"],
  ["bde-performance", "BDE performance"],
  ["monthly-summary", "Monthly summary"],
] as const;

const localDate = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const money = (value: string | number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value));
const displayValue = (value: unknown) => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

export default function AdminDashboard({ profile }: { profile: AdminProfile }) {
  const today = new Date();
  const fromDefault = localDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const [from, setFrom] = useState(fromDefault);
  const [to, setTo] = useState(localDate(today));
  const [overview, setOverview] = useState<Overview | null>(null);
  const [performance, setPerformance] = useState<Performance["bdes"]>([]);
  const [reportType, setReportType] =
    useState<(typeof reportTypes)[number][0]>("monthly-summary");
  const [reportRows, setReportRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      apiClient<Overview>("/admin/overview"),
      apiClient<Performance>(`/admin/performance?from=${from}&to=${to}`),
    ])
      .then(([summary, results]) => {
        setOverview(summary);
        setPerformance(results.bdes);
        setError("");
      })
      .catch((reason: unknown) => {
        if (reason instanceof ApiError && reason.status === 401) {
          clearAccessToken();
          window.location.assign("/login");
          return;
        }
        if (reason instanceof ApiError && reason.status === 403) {
          window.location.assign("/dashboard");
          return;
        }
        setError(reason instanceof Error ? reason.message : "Unable to load the Admin dashboard.");
      })
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => {
    const query = new URLSearchParams({
      from,
      to,
    });
    setReportLoading(true);
    apiClient<ReportRow[]>(`/admin/reports/${reportType}?${query}`)
      .then(setReportRows)
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error ? reason.message : "Unable to load this report.",
        );
      })
      .finally(() => setReportLoading(false));
  }, [from, reportType, to]);

  const reportColumns = [
    ...new Set(reportRows.flatMap((row) => Object.keys(row))),
  ]
    .filter((column) => column !== "id")
    .slice(0, 6);

  if (loading) {
    return <main className="dashboard-loading">Loading Admin dashboard...</main>;
  }

  return (
    <main className="lead-workspace admin-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">ADMINISTRATION</p>
          <h1>Admin dashboard</h1>
          <p className="subtitle">
            Company-wide sales, team access, and reporting.
          </p>
        </div>
        <div className="workspace-actions">
          <button
            className="secondary-action"
            onClick={() => void logoutAndRedirect()}
          >
            Sign out
          </button>
          <Link className="secondary-action" href="/dashboard">
            CRM workspace
          </Link>
          <Link className="primary admin-manage-team-link" href="/admin/team">
            Manage team
          </Link>
        </div>
      </header>

      <section className="panel admin-profile">
        <div>
          <p className="eyebrow">SIGNED-IN ADMIN</p>
          <h2>{profile.fullName}</h2>
          <p>{profile.email}</p>
        </div>
        <span className="stage-pill">
          {profile.role} · {profile.isActive ? "Active" : "Inactive"}
        </span>
      </section>

      {error && (
        <div className="workspace-notice" role="alert">
          {error}
        </div>
      )}

      {overview && (
        <>
          <section className="metrics live-metrics">
            {[
              ["Total leads", overview.pipeline.reduce((sum, row) => sum + row.count, 0)],
              ["Won deals", overview.metrics.wonDeals ?? 0],
              ["Open pipeline", money(overview.revenue.pipeline)],
              ["Revenue this month", money(overview.revenue.month)],
              ["Follow-ups today", overview.metrics.todaysFollowUps ?? 0],
              ["Overdue follow-ups", overview.metrics.overdueFollowUps ?? 0],
            ].map(([label, value]) => (
              <article className="metric blue" key={label}>
                <div>
                  <p>{label}</p>
                  <h2>{value}</h2>
                </div>
              </article>
            ))}
          </section>
          <section className="panel admin-pipeline">
            <div className="panel-head">
              <div>
                <h2>Company pipeline</h2>
                <p>Current lead counts and estimated value by stage</p>
              </div>
            </div>
            <div className="lead-table-wrap">
              <table className="lead-table">
                <thead>
                  <tr><th>Stage</th><th>Leads</th><th>Estimated value</th></tr>
                </thead>
                <tbody>
                  {overview.pipeline.map((row) => (
                    <tr key={row.stage}>
                      <td>{row.stage.replaceAll("_", " ")}</td>
                      <td>{row.count}</td>
                      <td>{money(row.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className="panel admin-performance">
        <div className="panel-head">
          <div>
            <h2>BDE performance</h2>
            <p>Performance for the selected date range</p>
          </div>
          <div className="date-range-controls">
            <label>
              From
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label>
              To
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
          </div>
        </div>
        <div className="lead-table-wrap">
          <table className="lead-table performance-table">
            <thead>
              <tr>
                <th>BDE</th><th>Leads</th><th>Meetings</th><th>Proposals</th>
                <th>Negotiations</th><th>Won</th><th>Lost</th><th>Follow-ups done</th>
                <th>Overdue</th><th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {performance.map((row) => (
                <tr key={row.userId}>
                  <td>{row.name}</td><td>{row.totalLeads}</td><td>{row.meetings}</td>
                  <td>{row.proposals}</td><td>{row.negotiations}</td><td>{row.won}</td>
                  <td>{row.lost}</td><td>{row.followUpsCompleted}</td>
                  <td>{row.overdueFollowUps}</td><td>{money(row.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {performance.length === 0 && (
            <p className="empty-list">No BDE performance for this period.</p>
          )}
        </div>
      </section>

      <section className="panel admin-reports">
        <div className="panel-head">
          <div>
            <h2>Reports</h2>
            <p>Database-backed report records for the selected period</p>
          </div>
          <label className="admin-report-filter">
            Report
            <select
              value={reportType}
              onChange={(event) =>
                setReportType(event.target.value as (typeof reportTypes)[number][0])
              }
            >
              {reportTypes.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>
        {reportLoading ? (
          <p className="dashboard-loading">Loading report...</p>
        ) : reportColumns.length ? (
          <div className="lead-table-wrap">
            <table className="lead-table">
              <thead><tr>{reportColumns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
              <tbody>
                {reportRows.slice(0, 25).map((row, index) => (
                  <tr key={String(row.id ?? index)}>
                    {reportColumns.map((column) => (
                      <td key={column}>{displayValue(row[column])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {reportRows.length > 25 && (
              <p className="empty-list">Showing the first 25 of {reportRows.length} report rows.</p>
            )}
          </div>
        ) : (
          <p className="empty-list">No records found for this report and period.</p>
        )}
      </section>

    </main>
  );
}
