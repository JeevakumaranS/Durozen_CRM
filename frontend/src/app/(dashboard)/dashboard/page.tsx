"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { clearAccessToken, getAuthUser } from "../../../lib/auth";

type DashboardSummary = {
  metrics: {
    newLeads: number;
    contacted: number;
    interested: number;
    todaysMeetings: number;
    proposals: number;
    negotiations: number;
    wonDeals: number;
    lostDeals: number;
    todaysFollowUps: number;
    overdueFollowUps: number;
  };
  revenue: { today: string; week: string; month: string; pipeline: string };
  pipeline: { stage: string; count: number; value: string }[];
};

const stageLabels: Record<string, string> = {
  NEW_LEAD: "New lead",
  CONTACTED: "Contacted",
  INTERESTED: "Interested",
  MEETING: "Meeting",
  PROPOSAL: "Proposal",
  NEGOTIATION: "Negotiation",
  WON: "Won",
  LOST: "Lost",
};

const money = (value: string) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value));

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState("");
  const [userName, setUserName] = useState("Sales team");

  useEffect(() => {
    setUserName(getAuthUser()?.name ?? "Sales team");
    apiClient<DashboardSummary>("/dashboard/summary")
      .then(setSummary)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load dashboard.",
        ),
      );
  }, []);

  const metrics = summary
    ? ([
        ["New leads", summary.metrics.newLeads, "blue"],
        ["Contacted", summary.metrics.contacted, "blue"],
        ["Interested", summary.metrics.interested, "green"],
        ["Today’s meetings", summary.metrics.todaysMeetings, "amber"],
        ["Proposals", summary.metrics.proposals, "blue"],
        ["Negotiations", summary.metrics.negotiations, "amber"],
        ["Won deals", summary.metrics.wonDeals, "green"],
        ["Lost deals", summary.metrics.lostDeals, "red"],
        ["Today’s follow-ups", summary.metrics.todaysFollowUps, "amber"],
        ["Overdue follow-ups", summary.metrics.overdueFollowUps, "red"],
      ] as const)
    : [];
  const maxCount = Math.max(
    1,
    ...(summary?.pipeline.map((item) => item.count) ?? [1]),
  );

  return (
    <main className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <Link className="dashboard-brand" href="/dashboard">
          <span>DUROZEN</span>
          <small>CRM</small>
        </Link>
        <nav aria-label="Main navigation">
          {[
            ["Dashboard", "/dashboard"],
            ["Leads", "/leads"],
            ["Pipeline", "/pipeline"],
            ["Follow-ups", "/follow-ups"],
            ["Activities", "/activities"],
            ["Meetings", "/meetings"],
            ["Proposals", "/proposals"],
            ["Negotiations", "/negotiations"],
            ["Customers", "/customers"],
            ["Performance", "/performance"],
            ["Reports", "/reports"],
          ].map(([label, href]) => (
            <Link
              className={href === "/dashboard" ? "selected" : ""}
              href={href}
              key={href}
            >
              {label}
            </Link>
          ))}
        </nav>
        <button
          className="dashboard-user"
          onClick={() => {
            clearAccessToken();
            window.location.assign("/login");
          }}
          title="Sign out"
        >
          <span>{userName.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{userName}</strong>
            <small>Sign out</small>
          </div>
        </button>
      </aside>
      <section className="dashboard-content">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">SALES OVERVIEW</p>
            <h1>Dashboard</h1>
            <p className="subtitle">
              A live view of team activity and sales movement.
            </p>
          </div>
          <Link className="primary" href="/leads">
            + Add lead
          </Link>
        </header>
        {error && (
          <div className="workspace-notice" role="alert">
            {error}
          </div>
        )}
        {!summary && !error && (
          <div className="dashboard-loading">Loading sales activity...</div>
        )}
        {summary && (
          <>
            <div className="metrics live-metrics">
              {metrics.map(([label, value, color]) => (
                <article className={`metric ${color}`} key={label}>
                  <div>
                    <p>{label}</p>
                    <h2>{value}</h2>
                    <small>Current total</small>
                  </div>
                  <span aria-hidden="true">
                    {color === "green"
                      ? "↗"
                      : color === "amber"
                        ? "◷"
                        : color === "red"
                          ? "!"
                          : "◎"}
                  </span>
                </article>
              ))}
            </div>
            <section className="revenue-strip" aria-label="Revenue summary">
              <div>
                <span>Today’s won revenue</span>
                <strong>{money(summary.revenue.today)}</strong>
              </div>
              <div>
                <span>This week</span>
                <strong>{money(summary.revenue.week)}</strong>
              </div>
              <div>
                <span>This month</span>
                <strong>{money(summary.revenue.month)}</strong>
              </div>
              <div>
                <span>Open pipeline value</span>
                <strong>{money(summary.revenue.pipeline)}</strong>
              </div>
            </section>
            <section className="dashboard-panels">
              <article className="panel pipeline-overview">
                <div className="panel-head">
                  <div>
                    <h2>Pipeline overview</h2>
                    <p>Lead count and estimated value by stage</p>
                  </div>
                  <Link className="text-btn" href="/pipeline">
                    View pipeline →
                  </Link>
                </div>
                <div className="bars">
                  {summary.pipeline.map((item, index) => (
                    <div className="bar" key={item.stage}>
                      <div>
                        <span>{stageLabels[item.stage] ?? item.stage}</span>
                        <b>{item.count}</b>
                      </div>
                      <div className="track">
                        <i
                          style={{
                            width: `${Math.max(2, (item.count / maxCount) * 100)}%`,
                            backgroundColor: [
                              "#2876a8",
                              "#368f9b",
                              "#4a9b72",
                              "#c18a2a",
                              "#b76545",
                              "#8f5367",
                              "#338263",
                              "#b84b50",
                            ][index],
                          }}
                        />
                      </div>
                      <small>{money(item.value)}</small>
                    </div>
                  ))}
                </div>
              </article>
              <article className="panel attention-panel">
                <div className="panel-head">
                  <div>
                    <h2>Follow-up attention</h2>
                    <p>Work due today and past due</p>
                  </div>
                  <Link className="text-btn" href="/follow-ups">
                    Open follow-ups →
                  </Link>
                </div>
                <div className="attention-count">
                  <div>
                    <strong>{summary.metrics.todaysFollowUps}</strong>
                    <span>Due today</span>
                  </div>
                  <div className="overdue-count">
                    <strong>{summary.metrics.overdueFollowUps}</strong>
                    <span>Overdue</span>
                  </div>
                </div>
                <p className="attention-note">
                  Keep active leads moving with a clear next action and
                  follow-up date.
                </p>
              </article>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
