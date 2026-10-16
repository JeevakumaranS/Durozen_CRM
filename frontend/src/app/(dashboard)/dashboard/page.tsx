"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { notify } from "../../../lib/notifications";

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

  useEffect(() => {
    apiClient<DashboardSummary>("/dashboard/summary")
      .then(setSummary)
      .catch((reason: unknown) => {
        const message =
          reason instanceof Error
            ? reason.message
            : "Unable to load dashboard.";
        setError(message);
        notify(message, "error");
      });
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
    <main className="dashboard-overview">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">SALES OVERVIEW</p>
            <h1>Dashboard</h1>
            <p className="subtitle">
              A live view of team activity and sales movement.
            </p>
          </div>
          <Link className="primary" href="/leads/new">
            + Add lead
          </Link>
        </header>
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
                <span>Open Sales Pipeline value</span>
                <strong>{money(summary.revenue.pipeline)}</strong>
              </div>
            </section>
            <section className="dashboard-panels">
              <article className="panel pipeline-overview">
                <div className="panel-head">
                  <div>
                    <h2>Sales Pipeline overview</h2>
                    <p>Lead count and estimated value by stage</p>
                  </div>
                  <Link className="text-btn" href="/pipeline">
                    View Sales Pipeline →
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
                  <Link className="text-btn" href="/tasks">
                    Open tasks →
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
    </main>
  );
}
