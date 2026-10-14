"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiClient } from "../../lib/api-client";

type MeetingStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";
type MeetingActivity = {
  id: string;
  type: string;
  description: string;
  createdAt: string;
  user?: { fullName: string } | null;
};
type MeetingFollowUp = {
  id: string;
  dueAt: string;
  nextAction: string;
  status: string;
};
type Meeting = {
  id: string;
  leadId: string;
  meetingAt: string;
  status: MeetingStatus;
  completedAt?: string | null;
  type: string;
  participants?: string | null;
  requirement?: string | null;
  budget?: string | number | null;
  discussionNotes?: string | null;
  customerConcerns?: string | null;
  nextAction: string;
  followUpAt: string;
  lead: {
    id: string;
    customerName: string;
    businessName?: string | null;
    mobileNumber: string;
    stage: string;
    assignedBde: { id: string; fullName: string };
  };
  activities: MeetingActivity[];
  followUps: MeetingFollowUp[];
};
type LeadOption = {
  id: string;
  customerName: string;
  stage: string;
  assignedBde: { fullName: string };
};
type MeetingForm = {
  leadId: string;
  meetingAt: string;
  type: string;
  participants: string;
  requirement: string;
  budget: string;
  discussionNotes: string;
  customerConcerns: string;
  nextAction: string;
  followUpAt: string;
};

const TYPES = [
  "Online Meeting",
  "Offline Meeting",
  "Product Demo",
  "Requirement Discussion",
  "Business Discussion",
];
const STATUSES: { value: "ALL" | MeetingStatus; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];
const emptyForm = (): MeetingForm => ({
  leadId: "",
  meetingAt: "",
  type: TYPES[0],
  participants: "",
  requirement: "",
  budget: "",
  discussionNotes: "",
  customerConcerns: "",
  nextAction: "",
  followUpAt: "",
});
const dateTime = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
const localDateTime = (value?: string) => {
  const date = value ? new Date(value) : new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};
const dateValue = (value: string) => new Date(value).toISOString();
const displayValue = (value?: string | number | null) =>
  value === null || value === undefined || value === "" ? "—" : String(value);

export function MeetingWorkspace() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]["value"]>("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [rescheduling, setRescheduling] = useState<Meeting | null>(null);
  const [viewing, setViewing] = useState<Meeting | null>(null);
  const [form, setForm] = useState<MeetingForm>(emptyForm);
  const [rescheduleAt, setRescheduleAt] = useState("");
  const pageSize = 9;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("search", query.trim());
      if (status !== "ALL") params.set("status", status);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const [rows, leadRows] = await Promise.all([
        apiClient<Meeting[]>(`/meetings?${params}`),
        apiClient<LeadOption[]>("/leads"),
      ]);
      setMeetings(rows);
      setLeads(
        leadRows.filter((lead) => !["WON", "LOST"].includes(lead.stage)),
      );
    } catch (reason) {
      setMeetings([]);
      setLeads([]);
      setError(
        reason instanceof Error ? reason.message : "Unable to load meetings.",
      );
    } finally {
      setLoading(false);
    }
  }, [from, query, status, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const orderedMeetings = [...meetings].sort(
    (first, second) => {
      const statusOrder =
        Number(first.status !== "SCHEDULED") -
        Number(second.status !== "SCHEDULED");
      return (
        statusOrder ||
        new Date(first.meetingAt).getTime() -
          new Date(second.meetingAt).getTime()
      );
    },
  );
  const totalPages = Math.max(1, Math.ceil(orderedMeetings.length / pageSize));
  const visibleMeetings = orderedMeetings.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function startCreate() {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
  }

  function startEdit(meeting: Meeting) {
    setEditing(meeting);
    setForm({
      leadId: meeting.leadId,
      meetingAt: localDateTime(meeting.meetingAt),
      type: meeting.type,
      participants: meeting.participants ?? "",
      requirement: meeting.requirement ?? "",
      budget: meeting.budget === null ? "" : String(meeting.budget ?? ""),
      discussionNotes: meeting.discussionNotes ?? "",
      customerConcerns: meeting.customerConcerns ?? "",
      nextAction: meeting.nextAction,
      followUpAt: localDateTime(meeting.followUpAt),
    });
    setShowForm(true);
  }

  async function saveMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const followUpChanged =
      !!editing &&
      (form.nextAction !== editing.nextAction ||
        new Date(form.followUpAt).getTime() !==
          new Date(editing.followUpAt).getTime());
    const body = {
      ...(editing ? {} : { leadId: form.leadId }),
      ...(editing ? {} : { meetingAt: dateValue(form.meetingAt) }),
      type: form.type,
      participants: form.participants || (editing ? null : undefined),
      requirement: form.requirement || (editing ? null : undefined),
      budget: form.budget ? Number(form.budget) : editing ? null : undefined,
      discussionNotes: form.discussionNotes || (editing ? null : undefined),
      customerConcerns: form.customerConcerns || (editing ? null : undefined),
      ...(!editing || followUpChanged ? { nextAction: form.nextAction } : {}),
      ...(!editing || followUpChanged
        ? { followUpAt: dateValue(form.followUpAt) }
        : {}),
    };
    try {
      await apiClient<Meeting>(
        editing ? `/meetings/${editing.id}` : "/meetings",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify(body),
        },
      );
      setShowForm(false);
      setEditing(null);
      setNotice(editing ? "Meeting details updated." : "Meeting scheduled.");
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to save meeting.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function rescheduleMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rescheduling) return;
    setBusy(true);
    setError("");
    try {
      await apiClient<Meeting>(`/meetings/${rescheduling.id}/reschedule`, {
        method: "PATCH",
        body: JSON.stringify({ meetingAt: dateValue(rescheduleAt) }),
      });
      setNotice("Meeting rescheduled. The previous time remains in its history.");
      setRescheduling(null);
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to reschedule meeting.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(meeting: Meeting, action: "complete" | "cancel") {
    const prompt =
      action === "complete"
        ? `Mark the meeting with ${meeting.lead.customerName} as completed?`
        : `Cancel the scheduled meeting with ${meeting.lead.customerName}? The meeting record will be retained.`;
    if (!window.confirm(prompt)) return;
    setBusy(true);
    setError("");
    try {
      await apiClient<Meeting>(`/meetings/${meeting.id}/${action}`, {
        method: "PATCH",
      });
      setNotice(
        action === "complete" ? "Meeting marked completed." : "Meeting cancelled.",
      );
      if (viewing?.id === meeting.id) setViewing(null);
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : `Unable to ${action} meeting.`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="lead-workspace meeting-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">CUSTOMER CONVERSATIONS</p>
          <h1>Meetings</h1>
          <p className="subtitle">
            Schedule meetings and keep their outcomes and history with each lead.
          </p>
        </div>
        <div className="workspace-actions">
          <Link className="secondary-action" href="/pipeline">
            Pipeline
          </Link>
          <button className="primary" onClick={startCreate}>
            + Schedule meeting
          </button>
        </div>
      </header>
      {error && (
        <div className="workspace-notice" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="workspace-notice" role="status">
          {notice}
          <button onClick={() => setNotice("")} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      <div className="meeting-tools">
        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="Search meetings"
            placeholder="Search lead, business, mobile, or BDE"
            value={query}
            onChange={(event) => {
              setPage(1);
              setQuery(event.target.value);
            }}
          />
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value as (typeof STATUSES)[number]["value"]);
            }}
          >
            {STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setPage(1);
              setFrom(event.target.value);
            }}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={to}
            onChange={(event) => {
              setPage(1);
              setTo(event.target.value);
            }}
          />
        </label>
      </div>
      {loading ? (
        <p className="empty-list meeting-empty" role="status">
          Loading meetings...
        </p>
      ) : error ? null : orderedMeetings.length === 0 ? (
        <>
          <p className="empty-list meeting-empty">
            No meetings match these filters.
          </p>
          <nav className="meeting-pagination" aria-label="Meetings pagination">
            <span>0 meetings · Page 1 of 1</span>
            <div>
              <button type="button" disabled>
                Previous
              </button>
              <button type="button" disabled>
                Next
              </button>
            </div>
          </nav>
        </>
      ) : (
        <>
          <div className="meeting-grid" aria-live="polite">
            {visibleMeetings.map((meeting) => (
              <article className="meeting-card" key={meeting.id}>
                <div className="meeting-card-main">
                  <div className="meeting-card-heading">
                    <div className="meeting-card-lead">
                      <Link href={`/leads/${meeting.lead.id}`}>
                        {meeting.lead.customerName}
                      </Link>
                      <p title={meeting.lead.businessName || meeting.lead.mobileNumber}>
                        {meeting.lead.businessName || meeting.lead.mobileNumber}
                      </p>
                    </div>
                    <span
                      className={`meeting-status meeting-status-${meeting.status.toLowerCase()}`}
                    >
                      {meeting.status.toLowerCase()}
                    </span>
                  </div>
                  <div className="meeting-card-time">
                    <span>Meeting</span>
                    <strong>{dateTime(meeting.meetingAt)}</strong>
                  </div>
                  <dl className="meeting-card-details">
                    <div>
                      <dt>Type</dt>
                      <dd>{meeting.type}</dd>
                    </div>
                    <div>
                      <dt>Assigned BDE</dt>
                      <dd>{meeting.lead.assignedBde.fullName}</dd>
                    </div>
                    <div>
                      <dt>Next follow-up</dt>
                      <dd>{dateTime(meeting.followUpAt)}</dd>
                    </div>
                    <div>
                      <dt>Next action</dt>
                      <dd title={meeting.nextAction}>{meeting.nextAction || "—"}</dd>
                    </div>
                    {meeting.requirement && (
                      <div className="meeting-card-agenda">
                        <dt>Purpose / agenda</dt>
                        <dd title={meeting.requirement}>{meeting.requirement}</dd>
                      </div>
                    )}
                    {meeting.discussionNotes && (
                      <div className="meeting-card-agenda">
                        <dt>Discussion notes</dt>
                        <dd title={meeting.discussionNotes}>{meeting.discussionNotes}</dd>
                      </div>
                    )}
                  </dl>
                </div>
                <footer className="meeting-card-actions">
                  <button onClick={() => setViewing(meeting)}>View</button>
                  {meeting.status === "SCHEDULED" && (
                    <>
                      <button onClick={() => startEdit(meeting)}>Edit</button>
                      <button
                        onClick={() => {
                          setRescheduling(meeting);
                          setRescheduleAt(localDateTime(meeting.meetingAt));
                        }}
                      >
                        Reschedule
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => void updateStatus(meeting, "complete")}
                      >
                        Complete
                      </button>
                      <button
                        className="meeting-cancel"
                        disabled={busy}
                        onClick={() => void updateStatus(meeting, "cancel")}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </footer>
              </article>
            ))}
          </div>
          <nav className="meeting-pagination" aria-label="Meetings pagination">
            <span>
              {orderedMeetings.length} {orderedMeetings.length === 1 ? "meeting" : "meetings"} · Page {page} of {totalPages}
            </span>
            <div>
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page === 1}
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page === totalPages}
              >
                Next
              </button>
            </div>
          </nav>
        </>
      )}

      {showForm && (
        <div className="modal-backdrop">
          <section
            className="lead-modal meeting-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="meeting-form-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">CUSTOMER CONVERSATION</p>
                <h2 id="meeting-form-title">
                  {editing ? "Edit scheduled meeting" : "Schedule meeting"}
                </h2>
              </div>
              <button
                className="modal-close"
                aria-label="Close"
                onClick={() => setShowForm(false)}
              >
                ×
              </button>
            </div>
            <form className="lead-form meeting-form" onSubmit={saveMeeting}>
              {!editing && (
                <label className="form-wide">
                  Lead *
                  <select
                    required
                    value={form.leadId}
                    onChange={(event) =>
                      setForm({ ...form, leadId: event.target.value })
                    }
                  >
                    <option value="">Select an active lead</option>
                    {leads.map((lead) => (
                      <option key={lead.id} value={lead.id}>
                        {lead.customerName} · {lead.stage.replaceAll("_", " ")} ·{" "}
                        {lead.assignedBde.fullName}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {!editing && (
                <label>
                  Meeting date and time *
                  <input
                    type="datetime-local"
                    required
                    value={form.meetingAt}
                    onChange={(event) =>
                      setForm({ ...form, meetingAt: event.target.value })
                    }
                  />
                </label>
              )}
              <label>
                Meeting type *
                <select
                  required
                  value={form.type}
                  onChange={(event) =>
                    setForm({ ...form, type: event.target.value })
                  }
                >
                  {TYPES.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label>
                Participants
                <input
                  value={form.participants}
                  onChange={(event) =>
                    setForm({ ...form, participants: event.target.value })
                  }
                />
              </label>
              <label>
                Budget (₹)
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.budget}
                  onChange={(event) =>
                    setForm({ ...form, budget: event.target.value })
                  }
                />
              </label>
              <label className="form-wide">
                Purpose / agenda
                <textarea
                  rows={2}
                  value={form.requirement}
                  onChange={(event) =>
                    setForm({ ...form, requirement: event.target.value })
                  }
                />
              </label>
              <label className="form-wide">
                Discussion notes
                <textarea
                  rows={2}
                  value={form.discussionNotes}
                  onChange={(event) =>
                    setForm({ ...form, discussionNotes: event.target.value })
                  }
                />
              </label>
              <label className="form-wide">
                Customer concerns
                <textarea
                  rows={2}
                  value={form.customerConcerns}
                  onChange={(event) =>
                    setForm({ ...form, customerConcerns: event.target.value })
                  }
                />
              </label>
              <label>
                Next follow-up *
                <input
                  type="datetime-local"
                  required
                  value={form.followUpAt}
                  onChange={(event) =>
                    setForm({ ...form, followUpAt: event.target.value })
                  }
                />
              </label>
              <label>
                Next action *
                <input
                  required
                  value={form.nextAction}
                  onChange={(event) =>
                    setForm({ ...form, nextAction: event.target.value })
                  }
                />
              </label>
              <div className="form-footer">
                <p>
                  Scheduling may move the lead to Meeting when that transition
                  is allowed. It does not create a duplicate meeting on stage
                  changes.
                </p>
                <button
                  className="primary"
                  disabled={busy || (!editing && leads.length === 0)}
                >
                  {busy ? "Saving..." : editing ? "Save changes" : "Schedule"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {rescheduling && (
        <div className="modal-backdrop">
          <section
            className="lead-modal meeting-reschedule-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reschedule-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">RESCHEDULE</p>
                <h2 id="reschedule-title">{rescheduling.lead.customerName}</h2>
              </div>
              <button
                className="modal-close"
                aria-label="Close"
                onClick={() => setRescheduling(null)}
              >
                ×
              </button>
            </div>
            <form onSubmit={rescheduleMeeting}>
              <label>
                New meeting date and time
                <input
                  type="datetime-local"
                  required
                  value={rescheduleAt}
                  onChange={(event) => setRescheduleAt(event.target.value)}
                />
              </label>
              <p>The previous time will remain in the meeting history.</p>
              <button className="primary" disabled={busy}>
                {busy ? "Saving..." : "Confirm reschedule"}
              </button>
            </form>
          </section>
        </div>
      )}

      {viewing && (
        <div className="modal-backdrop">
          <section
            className="lead-modal meeting-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="meeting-detail-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">MEETING DETAILS</p>
                <h2 id="meeting-detail-title">{viewing.lead.customerName}</h2>
              </div>
              <button
                className="modal-close"
                aria-label="Close"
                onClick={() => setViewing(null)}
              >
                ×
              </button>
            </div>
            <dl className="meeting-detail-grid">
              <div><dt>Status</dt><dd>{viewing.status}</dd></div>
              <div><dt>Scheduled</dt><dd>{dateTime(viewing.meetingAt)}</dd></div>
              <div><dt>Completed</dt><dd>{dateTime(viewing.completedAt)}</dd></div>
              <div><dt>Type</dt><dd>{viewing.type}</dd></div>
              <div><dt>Lead stage</dt><dd>{viewing.lead.stage.replaceAll("_", " ")}</dd></div>
              <div><dt>Assigned BDE</dt><dd>{viewing.lead.assignedBde.fullName}</dd></div>
              <div><dt>Participants</dt><dd>{displayValue(viewing.participants)}</dd></div>
              <div><dt>Budget</dt><dd>{displayValue(viewing.budget)}</dd></div>
              <div className="meeting-detail-wide"><dt>Purpose / agenda</dt><dd>{displayValue(viewing.requirement)}</dd></div>
              <div className="meeting-detail-wide"><dt>Discussion notes</dt><dd>{displayValue(viewing.discussionNotes)}</dd></div>
              <div className="meeting-detail-wide"><dt>Customer concerns</dt><dd>{displayValue(viewing.customerConcerns)}</dd></div>
              <div><dt>Next action</dt><dd>{viewing.nextAction}</dd></div>
              <div><dt>Follow-up date</dt><dd>{dateTime(viewing.followUpAt)}</dd></div>
            </dl>
            <h3>Meeting history</h3>
            <div className="meeting-history">
              {viewing.activities.map((activity) => (
                <article key={activity.id}>
                  <strong>{activity.type.replaceAll("_", " ")}</strong>
                  <time>{dateTime(activity.createdAt)}</time>
                  <p>{activity.description}</p>
                  {activity.user?.fullName && <small>By {activity.user.fullName}</small>}
                </article>
              ))}
              {viewing.activities.length === 0 && (
                <p className="empty-list">No meeting history recorded.</p>
              )}
            </div>
            <p className="meeting-lead-history">
              View the complete lead activity history from{" "}
              <Link href={`/leads/${viewing.lead.id}`}>lead details</Link>.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}
