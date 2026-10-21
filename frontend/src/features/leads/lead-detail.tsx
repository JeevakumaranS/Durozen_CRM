"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "../../lib/api-client";
import { LEAD_UPDATED_EVENT } from "../../lib/lead-events";
import { notify } from "../../lib/notifications";
import { ClockDateTimePicker } from "../../components/shared/clock-date-time-picker";
import {
  businessDateTimeToIso,
  formatBusinessDateTime,
  formatEmbeddedDateTimes,
} from "../../lib/business-time";

type Activity = {
  id: string;
  type: string;
  description: string;
  outcome?: string | null;
  nextAction?: string | null;
  contactDate?: string | null;
  contactType?: string | null;
  customerResponse?: string | null;
  expectedTimeline?: string | null;
  requirement?: string | null;
  estimatedBudget?: string | number | null;
  remarks?: string | null;
  followUpAt?: string | null;
  createdAt: string;
  user?: { fullName: string } | null;
};
type LeadDetails = {
  id: string;
  leadNumber: string;
  leadDate: string;
  customerName: string;
  businessName?: string | null;
  businessCategory?: string | null;
  mobileNumber: string;
  email?: string | null;
  location?: string | null;
  requirement?: string | null;
  estimatedBudget?: string | number | null;
  finalDealValue?: string | number | null;
  wonService?: string | null;
  paymentStatus?: string | null;
  advanceAmount?: string | number | null;
  confirmedAt?: string | null;
  expectedStartDate?: string | null;
  wonRemarks?: string | null;
  leadSource: string;
  priority: string;
  stage: string;
  nextAction?: string | null;
  followUpAt?: string | null;
  remarks?: string | null;
  stageEnteredAt: string;
  assignedBde: { fullName: string };
  activities: Activity[];
};

const activityTypes = [
  "Meeting",
  "Proposal",
  "Negotiation",
];
const dateTime = formatBusinessDateTime;
const leadDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`));

export function LeadDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [lead, setLead] = useState<LeadDetails | null>(null);
  const [type, setType] = useState("Meeting");
  const [description, setDescription] = useState("");
  const [outcome, setOutcome] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(
    null,
  );
  const timelineActivities = lead?.activities ?? [];

  const load = useCallback(async () => {
    try {
      setLead(await apiClient<LeadDetails>(`/leads/${id}`));
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to load this lead.",
        "error",
      );
    }
  }, [id]);

  useEffect(() => {
    if (id) void load();
  }, [id, load]);

  useEffect(() => {
    const refreshLead = (event: Event) => {
      const { leadId } = (event as CustomEvent<{ leadId: string }>).detail;
      if (leadId === id) void load();
    };
    window.addEventListener(LEAD_UPDATED_EVENT, refreshLead);
    return () => window.removeEventListener(LEAD_UPDATED_EVENT, refreshLead);
  }, [id, load]);

  async function addActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nextAction.trim()) {
      notify("Enter the next action before adding an activity.", "error");
      return;
    }
    if (!followUpAt) {
      notify("Choose a next follow-up date and time.", "error");
      return;
    }
    setBusy(true);
    try {
      await apiClient<Activity>(`/leads/${id}/activities`, {
        method: "POST",
        body: JSON.stringify({
          type,
          description,
          outcome: outcome || undefined,
          nextAction: nextAction.trim(),
          followUpAt: businessDateTimeToIso(followUpAt),
        }),
      });
      setDescription("");
      setOutcome("");
      setNextAction("");
      setFollowUpAt("");
      notify("Activity added to the lead timeline.");
      await load();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to add activity.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  const stageAge = lead
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(lead.stageEnteredAt).getTime()) / 86400000,
        ),
      )
    : 0;
  if (!lead)
    return (
      <main className="lead-workspace">
        <Link className="detail-back" href="/leads">
          ← Leads
        </Link>
        <p>Loading lead...</p>
      </main>
    );

  return (
    <main className="lead-workspace">
      <Link className="detail-back" href="/leads">
        ← All leads
      </Link>
      <header className="detail-header">
        <div>
          <p className="eyebrow">{lead.leadNumber}</p>
          <h1>{lead.customerName}</h1>
          <p className="subtitle">
            {lead.businessName ||
              lead.businessCategory ||
              "Prospective customer"}{" "}
            · {lead.mobileNumber}
          </p>
        </div>
        <span className={`stage-pill stage-${lead.stage.toLowerCase()}`}>
          {lead.stage.replaceAll("_", " ")}
        </span>
      </header>
      <div className="detail-grid">
        <section className="panel detail-main">
          <div className="detail-section-heading">
            <div>
              <h2>Next action</h2>
              <p>Every active opportunity needs a dated next step.</p>
            </div>
          </div>
          <div className="next-action-box">
            <strong>{lead.nextAction || "No next action set"}</strong>
            <span>
              {lead.followUpAt
                ? `Due ${dateTime(lead.followUpAt)}`
                : "No follow-up scheduled"}
            </span>
          </div>
          <div className="detail-section-heading timeline-heading">
            <div>
              <h2>Activity timeline</h2>
              <p>Customer interactions and updates, newest first.</p>
            </div>
          </div>
          <div className="activity-timeline">
            {timelineActivities.map((activity) => (
              <article className="timeline-item" key={activity.id}>
                <span className="timeline-marker" />
                <div className="timeline-entry">
                  <button
                    aria-expanded={expandedActivityId === activity.id}
                    className="timeline-entry-toggle"
                    onClick={() =>
                      setExpandedActivityId((current) =>
                        current === activity.id ? null : activity.id,
                      )
                    }
                    type="button"
                  >
                    <span className="timeline-entry-head">
                      <strong>{activity.type.replaceAll("_", " ")}</strong>
                      <time>{dateTime(activity.createdAt)}</time>
                    </span>
                    <span className="timeline-entry-description">
                      {formatEmbeddedDateTimes(activity.description)}
                    </span>
                    <span className="timeline-entry-prompt">
                      {expandedActivityId === activity.id
                        ? "Hide details"
                        : "View details"}
                    </span>
                  </button>
                  {expandedActivityId === activity.id && (
                    <dl className="timeline-event-details">
                      <div>
                        <dt>Description</dt>
                        <dd>{formatEmbeddedDateTimes(activity.description)}</dd>
                      </div>
                      {activity.outcome && (
                        <div>
                          <dt>Outcome</dt>
                          <dd>{activity.outcome}</dd>
                        </div>
                      )}
                      {activity.contactDate && (
                        <div>
                          <dt>Contact date</dt>
                          <dd>{leadDate(activity.contactDate)}</dd>
                        </div>
                      )}
                      {activity.contactType && (
                        <div>
                          <dt>Contact type</dt>
                          <dd>{activity.contactType}</dd>
                        </div>
                      )}
                      {activity.customerResponse && (
                        <div>
                          <dt>Customer response</dt>
                          <dd>{activity.customerResponse}</dd>
                        </div>
                      )}
                      {activity.requirement && (
                        <div>
                          <dt>Requirement</dt>
                          <dd>{activity.requirement}</dd>
                        </div>
                      )}
                      {activity.estimatedBudget !== null &&
                        activity.estimatedBudget !== undefined && (
                          <div>
                            <dt>Estimated budget</dt>
                            <dd>
                              ₹
                              {Number(activity.estimatedBudget).toLocaleString(
                                "en-IN",
                              )}
                            </dd>
                          </div>
                        )}
                      {activity.expectedTimeline && (
                        <div>
                          <dt>Expected timeline</dt>
                          <dd>{activity.expectedTimeline}</dd>
                        </div>
                      )}
                      {activity.remarks && (
                        <div>
                          <dt>Remarks</dt>
                          <dd>{activity.remarks}</dd>
                        </div>
                      )}
                      {activity.nextAction && (
                        <div>
                          <dt>Next action</dt>
                          <dd>{activity.nextAction}</dd>
                        </div>
                      )}
                      {activity.followUpAt && (
                        <div>
                          <dt>Follow-up</dt>
                          <dd>{dateTime(activity.followUpAt)}</dd>
                        </div>
                      )}
                      <div>
                        <dt>Recorded by</dt>
                        <dd>
                          {activity.user?.fullName || lead.assignedBde.fullName}
                        </dd>
                      </div>
                    </dl>
                  )}
                </div>
              </article>
            ))}
            {timelineActivities.length === 0 && (
              <p className="empty-list">No activity has been recorded yet.</p>
            )}
          </div>
        </section>
        <aside className="detail-aside">
          <section className="panel detail-facts">
            <h2>Lead details</h2>
            <dl>
              <div>
                <dt>Lead date</dt>
                <dd>{leadDate(lead.leadDate)}</dd>
              </div>
              <div>
                <dt>Assigned BDE</dt>
                <dd>{lead.assignedBde.fullName}</dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>
                  <span
                    className={`priority priority-${lead.priority.toLowerCase()}`}
                  >
                    {lead.priority}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Lead source</dt>
                <dd>{lead.leadSource}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{lead.location || "—"}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{lead.email || "—"}</dd>
              </div>
              <div>
                <dt>Requirement</dt>
                <dd>{lead.requirement || "—"}</dd>
              </div>
              <div>
                <dt>Remarks</dt>
                <dd>{lead.remarks || "—"}</dd>
              </div>
              <div>
                <dt>Estimated budget</dt>
                <dd>
                  {lead.estimatedBudget
                    ? `₹${Number(lead.estimatedBudget).toLocaleString("en-IN")}`
                    : "—"}
                </dd>
              </div>
              {lead.stage === "WON" && (
                <>
                  <div>
                    <dt>Service / project</dt>
                    <dd>{lead.wonService || "—"}</dd>
                  </div>
                  <div>
                    <dt>Final deal value</dt>
                    <dd>
                      {lead.finalDealValue
                        ? `₹${Number(lead.finalDealValue).toLocaleString("en-IN")}`
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Payment status</dt>
                    <dd>{lead.paymentStatus || "—"}</dd>
                  </div>
                  <div>
                    <dt>Advance amount</dt>
                    <dd>
                      {lead.advanceAmount == null
                        ? "—"
                        : `₹${Number(lead.advanceAmount).toLocaleString("en-IN")}`}
                    </dd>
                  </div>
                  <div>
                    <dt>Confirmed date</dt>
                    <dd>
                      {lead.confirmedAt ? dateTime(lead.confirmedAt) : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Expected start</dt>
                    <dd>
                      {lead.expectedStartDate
                        ? dateTime(lead.expectedStartDate)
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Deal remarks</dt>
                    <dd>{lead.wonRemarks || "—"}</dd>
                  </div>
                </>
              )}
              <div>
                <dt>Days in stage</dt>
                <dd>
                  {stageAge} {stageAge === 1 ? "day" : "days"}
                </dd>
              </div>
            </dl>
          </section>
          <section className="panel activity-form-panel">
            <h2>Log an activity</h2>
            <form onSubmit={addActivity} className="activity-form">
              <label>
                Activity type
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                >
                  {activityTypes.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Description
                <textarea
                  required
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <label>
                Outcome
                <input
                  value={outcome}
                  onChange={(event) => setOutcome(event.target.value)}
                />
              </label>
              <label>
                Next action *
                <input
                  required
                  value={nextAction}
                  onChange={(event) => setNextAction(event.target.value)}
                />
              </label>
              <ClockDateTimePicker
                className="form-wide"
                label="Next follow-up"
                required
                value={followUpAt}
                onChange={setFollowUpAt}
              />
              <button className="primary" disabled={busy}>
                {busy ? "Saving..." : "Add activity"}
              </button>
            </form>
          </section>
        </aside>
      </div>
    </main>
  );
}
