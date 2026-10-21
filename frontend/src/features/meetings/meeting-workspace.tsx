"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiClient } from "../../lib/api-client";
import { notify } from "../../lib/notifications";
import { ClockDateTimePicker } from "../../components/shared/clock-date-time-picker";
import { DateRangePicker } from "../../components/shared/date-range-picker";
import { LOST_REASONS } from "../leads/lost-reasons";
import {
  businessDateKey,
  businessDateTimeInputValue,
  businessDateTimeToIso,
  formatBusinessDateTime,
  formatEmbeddedDateTimes,
} from "../../lib/business-time";

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
const MEETING_STATUSES: MeetingStatus[] = [
  "SCHEDULED",
  "COMPLETED",
  "CANCELLED",
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
const dateTime = formatBusinessDateTime;
const localDateTime = (value?: string) =>
  businessDateTimeInputValue(value ?? new Date());
const dateValue = businessDateTimeToIso;
const displayValue = (value?: string | number | null) =>
  value === null || value === undefined || value === "" ? "—" : String(value);

export function MeetingWorkspace() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState<MeetingStatus[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dateFilterEnabled, setDateFilterEnabled] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [logLeadId, setLogLeadId] = useState("");
  const [logMeetingAt, setLogMeetingAt] = useState("");
  const [logType, setLogType] = useState(TYPES[0]);
  const [logDescription, setLogDescription] = useState("");
  const [logOutcome, setLogOutcome] = useState("");
  const [editing, setEditing] = useState<Meeting | null>(null);
  const [completing, setCompleting] = useState<Meeting | null>(null);
  const [completionRequirement, setCompletionRequirement] = useState("");
  const [completionBudget, setCompletionBudget] = useState("");
  const [completionDiscussionNotes, setCompletionDiscussionNotes] = useState("");
  const [completionNextAction, setCompletionNextAction] = useState("");
  const [completionFollowUpAt, setCompletionFollowUpAt] = useState("");
  const [completionLostReason, setCompletionLostReason] = useState(
    LOST_REASONS[0],
  );
  const [completionOtherLostReason, setCompletionOtherLostReason] = useState("");
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
      if (statuses.length) params.set("status", statuses.join(","));
      if (dateFilterEnabled && from) params.set("from", from);
      if (dateFilterEnabled && to) params.set("to", to);
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
      const message =
        reason instanceof Error ? reason.message : "Unable to load meetings.";
      setError(message);
      notify(message, "error");
    } finally {
      setLoading(false);
    }
  }, [
    dateFilterEnabled,
    from,
    query,
    statuses,
    to,
  ]);

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
    if (!editing && !form.meetingAt) {
      notify("Choose the meeting date and time.", "error");
      return;
    }

    if (editing && !form.followUpAt) {
      notify("Choose the next follow-up date and time.", "error");
      return;
    }
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
      ...(editing
        ? {
            budget: form.budget ? Number(form.budget) : null,
            discussionNotes: form.discussionNotes || null,
            customerConcerns: form.customerConcerns || null,
            ...(followUpChanged
              ? {
                  nextAction: form.nextAction,
                  followUpAt: dateValue(form.followUpAt),
                }
              : {}),
          }
        : {
            nextAction: "Attend scheduled meeting",
            followUpAt: dateValue(form.meetingAt),
          }),
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
      notify(editing ? "Meeting details updated." : "Meeting scheduled.");
      await load();
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "Unable to save meeting.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function logMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!logLeadId || !logMeetingAt || !logDescription.trim()) {
      notify("Choose a lead and meeting date, and enter meeting notes.", "error");
      return;
    }
    setBusy(true);
    try {
      await apiClient("/meetings/log", {
        method: "POST",
        body: JSON.stringify({
          leadId: logLeadId,
          meetingAt: dateValue(logMeetingAt),
          type: logType,
          description: logDescription.trim(),
          outcome: logOutcome.trim() || undefined,
        }),
      });
      setShowLogForm(false);
      setLogLeadId("");
      setLogMeetingAt("");
      setLogDescription("");
      setLogOutcome("");
      notify("Meeting logged to Meetings and the lead activity history.");
      await load();
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "Unable to log meeting.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function rescheduleMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rescheduling) return;
    if (!rescheduleAt) {
      notify("Choose the new meeting date and time.", "error");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiClient<Meeting>(`/meetings/${rescheduling.id}/reschedule`, {
        method: "PATCH",
        body: JSON.stringify({ meetingAt: dateValue(rescheduleAt) }),
      });
      notify("Meeting rescheduled. The previous time remains in its history.");
      setRescheduling(null);
      await load();
    } catch (reason) {
      notify(
        reason instanceof Error
          ? reason.message
          : "Unable to reschedule meeting.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(meeting: Meeting, action: "cancel") {
    const prompt = `Cancel the scheduled meeting with ${meeting.lead.customerName}? The meeting record will be retained.`;
    if (!window.confirm(prompt)) return;
    setBusy(true);
    setError("");
    try {
      await apiClient<Meeting>(`/meetings/${meeting.id}/${action}`, {
        method: "PATCH",
      });
      notify("Meeting cancelled.");
      if (viewing?.id === meeting.id) setViewing(null);
      await load();
    } catch (reason) {
      notify(
        reason instanceof Error
          ? reason.message
          : "Unable to cancel meeting.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  function startComplete(meeting: Meeting) {
    setCompleting(meeting);
    setCompletionRequirement(meeting.requirement ?? "");
    setCompletionBudget(
      meeting.budget === null || meeting.budget === undefined
        ? ""
        : String(meeting.budget),
    );
    setCompletionDiscussionNotes(meeting.discussionNotes ?? "");
    setCompletionNextAction("");
    setCompletionFollowUpAt("");
    setCompletionLostReason(LOST_REASONS[0]);
    setCompletionOtherLostReason("");
  }

  async function completeMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!completing) return;
    if (!completionRequirement.trim()) {
      notify("Enter the meeting requirement.", "error");
      return;
    }
    if (completionNextAction === "Proposal" && !completionFollowUpAt) {
      notify("Choose the next follow-up date and time.", "error");
      return;
    }
    if (!completionNextAction) {
      notify("Choose Proposal or Lost as the next action.", "error");
      return;
    }
    const lostReason =
      completionLostReason === "Other"
        ? completionOtherLostReason.trim()
        : completionLostReason;
    if (completionNextAction === "Lost" && !lostReason) {
      notify("Choose or enter a lost reason.", "error");
      return;
    }
    if (
      completionNextAction === "Proposal" &&
      new Date(businessDateTimeToIso(completionFollowUpAt)).getTime() <= Date.now()
    ) {
      notify("The next follow-up date and time must be in the future.", "error");
      return;
    }

    setBusy(true);
    try {
      await apiClient<Meeting>(`/meetings/${completing.id}/complete`, {
        method: "PATCH",
        body: JSON.stringify({
          requirement: completionRequirement.trim(),
          budget: completionBudget ? Number(completionBudget) : null,
          discussionNotes: completionDiscussionNotes.trim() || undefined,
          nextAction: completionNextAction,
          followUpAt:
            completionNextAction === "Proposal"
              ? businessDateTimeToIso(completionFollowUpAt)
              : undefined,
          lostReason:
            completionNextAction === "Lost" ? lostReason : undefined,
        }),
      });
      notify(
        completionNextAction === "Proposal"
          ? "Meeting completed. Lead remains in Meeting and a proposal follow-up was added."
          : "Meeting completed and lead moved to Lost.",
      );
      setCompleting(null);
      if (viewing?.id === completing.id) setViewing(null);
      await load();
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "Unable to complete meeting.",
        "error",
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
            Sales Pipeline
          </Link>
          <button
            className="secondary-action"
            onClick={() => {
              setLogLeadId("");
              setLogMeetingAt(localDateTime());
              setLogType(TYPES[0]);
              setLogDescription("");
              setLogOutcome("");
              setShowLogForm(true);
            }}
          >
            Log meeting
          </button>
          <button className="primary" onClick={startCreate}>
            + Schedule meeting
          </button>
        </div>
      </header>
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
      </div>
      <div className="meeting-filter-layout">
          <aside aria-label="Filter meetings" className="follow-up-filters">
            <h2>Filter Meetings</h2>
            <div className="follow-up-filter-options">
              <div className="follow-up-filter-option">
                <strong className="follow-up-status-filter-heading">Status</strong>
                {MEETING_STATUSES.map((item) => (
                  <label className="follow-up-filter-checkbox" key={item}>
                    <input
                      checked={statuses.includes(item)}
                      onChange={(event) => {
                        setPage(1);
                        setStatuses((current) =>
                          event.target.checked
                            ? [...current, item]
                            : current.filter((selected) => selected !== item),
                        );
                      }}
                      type="checkbox"
                    />
                    {item.charAt(0) + item.slice(1).toLowerCase()}
                  </label>
                ))}
              </div>
              <div className="follow-up-filter-option">
                <label className="follow-up-filter-checkbox">
                  <input
                    checked={dateFilterEnabled}
                    onChange={(event) => {
                      setPage(1);
                      setDateFilterEnabled(event.target.checked);
                      if (!event.target.checked) {
                        setFrom("");
                        setTo("");
                      }
                    }}
                    type="checkbox"
                  />
                  Date
                </label>
                {dateFilterEnabled && (
                  <DateRangePicker
                    from={from}
                    onChange={(start, end) => {
                      setPage(1);
                      setFrom(start);
                      setTo(end);
                    }}
                    to={to}
                  />
                )}
              </div>
            </div>
            <button
              className="secondary-action follow-up-clear"
              onClick={() => {
                setPage(1);
                setStatuses([]);
                setDateFilterEnabled(false);
                setFrom("");
                setTo("");
              }}
              type="button"
            >
              Clear filters
            </button>
          </aside>
        <div className="meeting-filter-results">
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
            {visibleMeetings.map((meeting) => {
              const meetingDayKey = businessDateKey(meeting.meetingAt);
              const todayKey = businessDateKey(new Date());
              const urgency =
                meeting.status === "SCHEDULED" &&
                meetingDayKey !== "" &&
                meetingDayKey < todayKey
                  ? "overdue"
                  : meeting.status === "SCHEDULED" &&
                      meetingDayKey !== "" &&
                      meetingDayKey === todayKey
                    ? "due-today"
                    : "";
              return (
                <article
                  className={`meeting-card${urgency ? ` ${urgency}` : ""}`}
                  key={meeting.id}
                >
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
                      className={`meeting-status meeting-status-${meeting.status.toLowerCase()}${urgency ? ` meeting-status-${urgency}` : ""}`}
                    >
                      {urgency === "overdue"
                        ? "Overdue"
                        : urgency === "due-today"
                          ? "Due today"
                          : meeting.status.toLowerCase()}
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
                  {meeting.status === "SCHEDULED" && (
                    <button
                      className="meeting-complete"
                      disabled={busy}
                      onClick={() => startComplete(meeting)}
                    >
                      Complete
                    </button>
                  )}
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
              );
            })}
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
        </div>
      </div>

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
                <ClockDateTimePicker
                  className="form-wide"
                  label="Meeting"
                  required
                  value={form.meetingAt}
                  onChange={(meetingAt) => setForm({ ...form, meetingAt })}
                />
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
              {editing && (
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
              )}
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
              {editing && (
                <>
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
                  <ClockDateTimePicker
                    className="form-wide"
                    label="Next follow-up"
                    required
                    value={form.followUpAt}
                    onChange={(followUpAt) => setForm({ ...form, followUpAt })}
                  />
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
                </>
              )}
              <div className="form-footer">
                <p>
                  {editing
                    ? "Update meeting details and follow-up information."
                    : "The meeting time will be used as the initial follow-up."}
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

      {showLogForm && (
        <div className="modal-backdrop">
          <section
            className="lead-modal meeting-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="meeting-log-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">CUSTOMER CONVERSATION</p>
                <h2 id="meeting-log-title">Log meeting</h2>
              </div>
              <button
                className="modal-close"
                aria-label="Close"
                onClick={() => setShowLogForm(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <form className="lead-form meeting-form" onSubmit={logMeeting}>
              <label className="form-wide">
                Lead *
                <select
                  required
                  value={logLeadId}
                  onChange={(event) => setLogLeadId(event.target.value)}
                >
                  <option value="">Select an active lead</option>
                  {leads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.customerName} · {lead.stage.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Meeting type *
                <select
                  required
                  value={logType}
                  onChange={(event) => setLogType(event.target.value)}
                >
                  {TYPES.map((meetingType) => (
                    <option key={meetingType}>{meetingType}</option>
                  ))}
                </select>
              </label>
              <ClockDateTimePicker
                label="Meeting date and time *"
                required
                value={logMeetingAt}
                onChange={setLogMeetingAt}
              />
              <label className="form-wide">
                Meeting notes *
                <textarea
                  required
                  rows={3}
                  value={logDescription}
                  onChange={(event) => setLogDescription(event.target.value)}
                />
              </label>
              <label className="form-wide">
                Outcome
                <textarea
                  rows={2}
                  value={logOutcome}
                  onChange={(event) => setLogOutcome(event.target.value)}
                />
              </label>
              <div className="form-footer">
                <p>The completed meeting will appear in Meetings and the lead’s activity history.</p>
                <button className="primary" disabled={busy}>
                  {busy ? "Saving..." : "Log meeting"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {completing && (
        <div className="modal-backdrop">
          <section
            className="lead-modal meeting-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="complete-meeting-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">MEETING OUTCOME</p>
                <h2 id="complete-meeting-title">
                  Complete meeting with {completing.lead.customerName}
                </h2>
              </div>
              <button
                className="modal-close"
                aria-label="Close"
                onClick={() => setCompleting(null)}
                type="button"
              >
                ×
              </button>
            </div>
            <form className="lead-form" onSubmit={completeMeeting}>
              <label className="form-wide">
                Requirement *
                <textarea
                  required
                  rows={2}
                  value={completionRequirement}
                  onChange={(event) =>
                    setCompletionRequirement(event.target.value)
                  }
                />
              </label>
              <label>
                Budget (₹)
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={completionBudget}
                  onChange={(event) =>
                    setCompletionBudget(event.target.value)
                  }
                />
              </label>
              <label className="form-wide">
                Discussion notes
                <textarea
                  rows={3}
                  value={completionDiscussionNotes}
                  onChange={(event) =>
                    setCompletionDiscussionNotes(event.target.value)
                  }
                />
              </label>
              <label className="form-wide">
                Next action *
                <select
                  required
                  value={completionNextAction}
                  onChange={(event) => {
                    setCompletionNextAction(event.target.value);
                    setCompletionFollowUpAt("");
                    setCompletionLostReason(LOST_REASONS[0]);
                    setCompletionOtherLostReason("");
                  }}
                >
                  <option value="">Choose next action</option>
                  <option value="Proposal">Proposal</option>
                  <option value="Lost">Lost</option>
                </select>
              </label>
              {completionNextAction === "Proposal" && (
                <ClockDateTimePicker
                  className="form-wide"
                  label="Next follow-up date"
                  required
                  minValue={businessDateTimeInputValue(new Date())}
                  value={completionFollowUpAt}
                  onChange={setCompletionFollowUpAt}
                />
              )}
              {completionNextAction === "Lost" && (
                <>
                  <label className="form-wide">
                    Lost reason *
                    <select
                      required
                      value={completionLostReason}
                      onChange={(event) => {
                        setCompletionLostReason(event.target.value);
                        setCompletionOtherLostReason("");
                      }}
                    >
                      {LOST_REASONS.map((reason) => (
                        <option key={reason}>{reason}</option>
                      ))}
                    </select>
                  </label>
                  {completionLostReason === "Other" && (
                    <label className="form-wide">
                      Other reason *
                      <input
                        required
                        value={completionOtherLostReason}
                        onChange={(event) =>
                          setCompletionOtherLostReason(event.target.value)
                        }
                      />
                    </label>
                  )}
                </>
              )}
              <div className="form-footer">
                <p>
                  Choosing Proposal creates a follow-up in Activities.
                  Choosing Lost closes the lead and cancels pending follow-ups.
                </p>
                <button className="primary" disabled={busy}>
                  {busy ? "Saving..." : "Complete meeting"}
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
              <ClockDateTimePicker
                className="form-wide"
                label="New meeting"
                required
                value={rescheduleAt}
                onChange={setRescheduleAt}
              />
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
                  <p>{formatEmbeddedDateTimes(activity.description)}</p>
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
