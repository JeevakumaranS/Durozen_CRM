"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiClient } from "../../../lib/api-client";

type Activity = {
  id: string;
  type: string;
  description: string;
  outcome?: string | null;
  nextAction?: string | null;
  previousStage?: string | null;
  newStage?: string | null;
  createdAt: string;
  user?: { fullName: string } | null;
  lead: {
    id: string;
    customerName: string;
    businessName?: string | null;
    assignedBde: { fullName: string };
  };
};
type ActivityPage = {
  items: Activity[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
const TYPES = [
  "Call",
  "WhatsApp",
  "Email",
  "Meeting",
  "Demo",
  "Note",
  "Proposal Sent",
  "Negotiation",
  "STAGE_CHANGE",
  "MEETING_SCHEDULED",
  "MEETING_UPDATED",
  "MEETING_RESCHEDULED",
  "MEETING_COMPLETED",
  "MEETING_CANCELLED",
];
const PAGE_SIZE = 15;

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [type, setType] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (type) params.set("type", type);
    if (query.trim()) params.set("search", query.trim());
    setLoading(true);
    setError("");
    apiClient<ActivityPage>(`/activities?${params}`)
      .then((result) => {
        if (!current) return;
        setActivities(result.items);
        setTotal(result.total);
        setTotalPages(result.totalPages);
      })
      .catch((reason: unknown) => {
        if (!current) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load activities.",
        );
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [page, query, type]);
  return (
    <main className="lead-workspace activity-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">CUSTOMER TOUCHPOINTS</p>
          <h1>Activities</h1>
          <p className="subtitle">
            Recent interactions and stage changes across your accessible leads.
          </p>
        </div>
        <Link className="secondary-action" href="/leads">
          All leads
        </Link>
      </header>
      {error && (
        <div className="workspace-notice" role="alert">
          {error}
        </div>
      )}
      <div className="activity-tools">
        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="Search activities"
            placeholder="Search customer, description, BDE..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Activity type
          <select
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All types</option>
            {TYPES.map((item) => (
              <option key={item} value={item}>
                {item.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <section className="global-activity-list">
        {loading ? (
          <div className="empty-list" role="status">Loading activities...</div>
        ) : activities.map((activity) => (
          <article className="global-activity" key={activity.id}>
            <span
              className={`global-activity-marker ${activity.type === "STAGE_CHANGE" ? "stage-marker" : ""}`}
            />
            <div className="global-activity-content">
              <div className="global-activity-top">
                <div>
                  <strong>
                    {activity.type === "STAGE_CHANGE"
                      ? "Stage change"
                      : activity.type.replaceAll("_", " ")}
                  </strong>
                  <span>
                    {activity.user?.fullName ||
                      activity.lead.assignedBde.fullName}
                  </span>
                </div>
                <time>
                  {new Intl.DateTimeFormat("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(activity.createdAt))}
                </time>
              </div>
              <p>{activity.description}</p>
              {activity.previousStage && activity.newStage && (
                <small>
                  {activity.previousStage.replaceAll("_", " ")} →{" "}
                  {activity.newStage.replaceAll("_", " ")}
                </small>
              )}
              {activity.outcome && <small>Outcome: {activity.outcome}</small>}
              {activity.nextAction && (
                <small>Next action: {activity.nextAction}</small>
              )}
              <Link href={`/leads/${activity.lead.id}`}>
                {activity.lead.customerName}
                {activity.lead.businessName
                  ? ` · ${activity.lead.businessName}`
                  : ""}
              </Link>
            </div>
          </article>
        ))}
        {!loading && activities.length === 0 && (
          <div className="empty-list">
            No activity recorded for these filters.
          </div>
        )}
      </section>
      {!loading && (
        <nav className="pagination" aria-label="Activity pages">
          <span>
            {total === 0
              ? "0–0 of 0"
              : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
          </span>
          {totalPages > 0 && (
            <div className="pagination-controls">
              <button
                className="secondary-action"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </button>
              <strong>
                Page {page} of {totalPages}
              </strong>
              <button
                className="secondary-action"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          )}
        </nav>
      )}
    </main>
  );
}
