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
];

export default function ActivitiesPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [type, setType] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    apiClient<Activity[]>(
      `/activities${type ? `?type=${encodeURIComponent(type)}` : ""}`,
    )
      .then(setActivities)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load activities.",
        ),
      );
  }, [type]);
  const filtered = activities.filter((activity) =>
    [
      activity.description,
      activity.lead.customerName,
      activity.lead.businessName,
      activity.user?.fullName,
      activity.outcome,
    ].some((value) => value?.toLowerCase().includes(query.toLowerCase())),
  );
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
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          Activity type
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">All types</option>
            {TYPES.map((item) => (
              <option key={item} value={item}>
                {item.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <span className="result-count">{filtered.length} entries</span>
      </div>
      <section className="global-activity-list">
        {filtered.map((activity) => (
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
                      : activity.type}
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
        {filtered.length === 0 && (
          <div className="empty-list">
            No activity recorded for these filters.
          </div>
        )}
      </section>
    </main>
  );
}
