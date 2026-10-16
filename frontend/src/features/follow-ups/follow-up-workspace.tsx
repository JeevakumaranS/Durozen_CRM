"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "../../lib/api-client";
import { notify } from "../../lib/notifications";
import { notifyLeadUpdated } from "../../lib/lead-events";
import { ClockDateTimePicker } from "../../components/shared/clock-date-time-picker";
import {
  BUSINESS_TIME_ZONE,
  businessDateTimeInputValue,
  businessDateTimeToIso,
  formatBusinessDateTime,
} from "../../lib/business-time";

type LeadOption = {
  id: string;
  customerName: string;
  stage: string;
  assignedBde: { fullName: string };
};
type ContactType =
  | "Phone Call"
  | "WhatsApp"
  | "Email"
  | "Direct Meeting"
  | "Other";
const CONTACT_TYPES: ContactType[] = [
  "Phone Call",
  "WhatsApp",
  "Email",
  "Direct Meeting",
  "Other",
];
type Assignee = { id: string; fullName: string };
type FollowUp = {
  id: string;
  dueAt: string;
  type: string;
  nextAction: string;
  remarks?: string | null;
  status: "PENDING" | "COMPLETED" | "RESCHEDULED" | "CANCELLED";
  lead: {
    id: string;
    customerName: string;
    businessName?: string | null;
    mobileNumber: string;
    stage: string;
    assignedBde: { id: string; fullName: string };
    activities?: { contactType: string | null }[];
  };
};
type FollowUpStatus = FollowUp["status"];
type NextLeadStage = "CONTACTED" | "INTERESTED" | "PROPOSAL" | "LOST";
type CompletionErrors = Partial<
  Record<
    | "nextAction"
    | "customerResponse"
    | "requirement"
    | "meetingChoice"
    | "meetingDate"
    | "meetingTime"
    | "meetingType",
    string
  >
>;
type FollowUpFilterKey =
  | "type"
  | "assignee"
  | "date";
const FOLLOW_UP_STATUSES: FollowUpStatus[] = [
  "PENDING",
  "COMPLETED",
];
const RESCHEDULE_REASONS = [
  "Customer requested",
  "Customer unavailable",
  "BDE unavailable",
] as const;
const MEETING_TYPES = [
  "In-person",
  "Phone",
  "Video",
];
const TYPES = [
  "Proposal Follow-up",
  "Negotiation",
];
const businessInputValue = businessDateTimeInputValue;
const businessDateTimeIso = businessDateTimeToIso;
const formatDate = formatBusinessDateTime;
const businessDateKey = (value: Date) => {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en", {
      timeZone: BUSINESS_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
};

export function FollowUpWorkspace() {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<FollowUp[]>([]);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [enabledFilters, setEnabledFilters] = useState<
    Record<FollowUpFilterKey, boolean>
  >({
    type: false,
    assignee: false,
    date: false,
  });
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [assignedBdeIds, setAssignedBdeIds] = useState<string[]>([]);
  const [statusFilters, setStatusFilters] = useState<FollowUpStatus[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leadId, setLeadId] = useState("");
  const [dueAt, setDueAt] = useState(
    businessInputValue(new Date(Date.now() + 86400000)),
  );
  const [type, setType] = useState("Proposal Follow-up");
  const [nextAction, setNextAction] = useState("");
  const [remarks, setRemarks] = useState("");
  const [editing, setEditing] = useState<{
    id: string;
    status: FollowUp["status"];
  } | null>(null);
  const [nextDueAt, setNextDueAt] = useState("");
  const [nextActionText, setNextActionText] = useState("");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [contactDate, setContactDate] = useState(businessDateKey(new Date()));
  const [contactType, setContactType] = useState<ContactType>("Phone Call");
  const [customerResponse, setCustomerResponse] = useState("");
  const [requirement, setRequirement] = useState("");
  const [selectedNextStage, setSelectedNextStage] =
    useState<NextLeadStage | "">("");
  const [completionErrors, setCompletionErrors] =
    useState<CompletionErrors>({});
  const [meetingChoice, setMeetingChoice] = useState<"yes" | "no" | "">("");
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [meetingType, setMeetingType] = useState("");
  const [rescheduleReason, setRescheduleReason] =
    useState<(typeof RESCHEDULE_REASONS)[number]>("Customer requested");
  const listRequestId = useRef(0);

  function toggleFilter(key: FollowUpFilterKey, enabled: boolean) {
    setEnabledFilters((current) => ({ ...current, [key]: enabled }));
    if (enabled) return;

    resetPage();
    if (key === "type") setTypeFilters([]);
    if (key === "assignee") setAssignedBdeIds([]);
    if (key === "date") {
      setFrom("");
      setTo("");
    }
  }

  const load = useCallback(async () => {
    const requestId = ++listRequestId.current;
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (enabledFilters.type && typeFilters.length)
      params.set("type", typeFilters.join(","));
    if (enabledFilters.assignee && assignedBdeIds.length)
      params.set("assignedBdeId", assignedBdeIds.join(","));
    if (statusFilters.length) params.set("status", statusFilters.join(","));
    if (enabledFilters.date && from) params.set("from", from);
    if (enabledFilters.date && to) params.set("to", to);
    try {
      const followUps = await apiClient<FollowUp[]>(`/follow-ups?${params}`);
      if (requestId === listRequestId.current) setItems(followUps);
    } catch (reason) {
      if (requestId === listRequestId.current) {
        setItems([]);
        const message =
          reason instanceof Error
            ? reason.message
            : "Unable to load tasks.";
        setError(message);
        notify(message, "error");
      }
    } finally {
      if (requestId === listRequestId.current) setLoading(false);
    }
  }, [
    assignedBdeIds,
    debouncedSearch,
    enabledFilters,
    from,
    statusFilters,
    to,
    typeFilters,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    Promise.all([
      apiClient<LeadOption[]>("/leads"),
      apiClient<Assignee[]>("/leads/assignees"),
    ])
      .then(([leadRows, authorizedAssignees]) => {
        setLeads(
          leadRows.filter((lead) => !["WON", "LOST"].includes(lead.stage)),
        );
        setAssignees(authorizedAssignees);
      })
      .catch((reason: unknown) => {
        notify(
          reason instanceof Error
            ? reason.message
            : "Unable to load task options.",
          "error",
        );
      });
  }, []);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const visibleItems = items.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function resetPage() {
    setPage(1);
  }

  async function createFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dueAt) {
      notify("Choose a due date and time.", "error");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiClient<FollowUp>("/follow-ups", {
        method: "POST",
        body: JSON.stringify({
          leadId,
          dueAt: businessDateTimeIso(dueAt),
          type,
          nextAction,
          remarks: remarks || undefined,
        }),
      });
      setShowCreate(false);
      setNextAction("");
      setRemarks("");
      notify("Task scheduled.");
      setPage(1);
      await load();
    } catch (reason) {
      notify(
        reason instanceof Error
          ? reason.message
          : "Unable to schedule task.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateFollowUp(item: FollowUp) {
    if (!editing) return;
    const completing = editing.status === "COMPLETED";
    const scheduleMeeting =
      completing &&
      selectedNextStage === "INTERESTED" &&
      meetingChoice === "yes";
    const nextErrors: CompletionErrors = {};
    if (completing) {
      if (!selectedNextStage) {
        nextErrors.nextAction = "Choose the next action.";
      }
      if (
        selectedNextStage === "INTERESTED" &&
        meetingChoice !== "yes" &&
        meetingChoice !== "no"
      ) {
        nextErrors.meetingChoice = "Choose Yes or No.";
      }
      if (selectedNextStage !== "LOST") {
        if (!customerResponse.trim()) {
          nextErrors.customerResponse = "Enter the next customer response.";
        }
        if (!requirement.trim()) {
          nextErrors.requirement = "Enter the requirements.";
        }
      }
      if (scheduleMeeting) {
        if (!meetingDate) {
          nextErrors.meetingDate = "Choose a meeting date.";
        } else if (meetingDate < businessDateKey(new Date())) {
          nextErrors.meetingDate = "Meeting date cannot be in the past.";
        }
        if (!meetingTime) {
          nextErrors.meetingTime = "Choose a meeting time.";
        }
        if (!meetingType) {
          nextErrors.meetingType = "Choose a meeting type.";
        }
        if (
          meetingDate &&
          meetingTime &&
          !nextErrors.meetingDate &&
          new Date(
            businessDateTimeIso(`${meetingDate}T${meetingTime}`),
          ).getTime() <= Date.now()
        ) {
          nextErrors.meetingTime = "Meeting date and time must be in the future.";
        }
      }
      setCompletionErrors(nextErrors);
      if (Object.keys(nextErrors).length) return;
    } else if (
      !completing &&
      !["WON", "LOST"].includes(item.lead.stage) &&
      (!nextDueAt || !nextActionText.trim())
    ) {
      notify(
        !nextActionText.trim()
          ? "Enter the next action."
          : "Choose the next task date and time.",
        "error",
      );
      return;
    }
    if (
      editing.status === "RESCHEDULED" &&
      !RESCHEDULE_REASONS.includes(rescheduleReason)
    ) {
      notify("Choose a reason for rescheduling.", "error");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await apiClient<FollowUp>(`/follow-ups/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: editing.status,
          dueAt: completing
            ? scheduleMeeting
              ? businessDateTimeIso(`${meetingDate}T${meetingTime}`)
              : undefined
            : nextDueAt && nextActionText.trim()
              ? businessDateTimeIso(nextDueAt)
              : undefined,
          nextAction: completing
            ? undefined
            : nextActionText.trim() || undefined,
          remarks:
            editing.status === "COMPLETED"
              ? outcomeNotes.trim() || null
              : outcomeNotes.trim() || undefined,
          ...(editing.status === "RESCHEDULED"
            ? { rescheduleReason }
            : {}),
          ...(editing.status === "COMPLETED"
            ? {
                contactDate: new Date(
                  `${contactDate}T00:00:00.000Z`,
                ).toISOString(),
                contactType,
                customerResponse: customerResponse.trim() || undefined,
                requirement:
                  selectedNextStage === "LOST"
                    ? undefined
                    : requirement.trim(),
                remarks: outcomeNotes.trim() || null,
                ...(selectedNextStage
                  ? {
                      nextStage: selectedNextStage,
                      ...(selectedNextStage === "INTERESTED"
                        ? { scheduleMeeting }
                        : {}),
                      ...(scheduleMeeting
                        ? {
                            meetingAt: businessDateTimeIso(
                              `${meetingDate}T${meetingTime}`,
                            ),
                            meetingType,
                          }
                        : {}),
                    }
                  : {}),
              }
            : {}),
        }),
      });
      if (editing.status === "COMPLETED") {
        notifyLeadUpdated(item.lead.id);
      }
      const nextStatus = editing.status;
      setEditing(null);
      setOutcomeNotes("");
      setCustomerResponse("");
      setRequirement("");
      setSelectedNextStage("");
      setMeetingChoice("");
      setCompletionErrors({});
      setRescheduleReason("Customer requested");
      setPage(1);
      notify(
        nextStatus === "COMPLETED"
          ? selectedNextStage === "LOST"
            ? "Lead moved to Lost."
            : scheduleMeeting
              ? "Lead moved to Interested and meeting scheduled."
              : selectedNextStage === "PROPOSAL"
                ? "Lead moved to Proposal."
              : selectedNextStage === "INTERESTED"
                ? "Lead moved to Interested."
                : "Lead moved to Contacted."
          : "Task rescheduled with one successor action.",
      );
      await load();
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "Unable to update task.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  function beginUpdate(item: FollowUp, status: FollowUpStatus) {
    setEditing({ id: item.id, status });
    setNextDueAt(businessInputValue(new Date(Date.now() + 86400000)));
    setNextActionText(status === "RESCHEDULED" ? item.nextAction : "");
    setOutcomeNotes(item.remarks ?? "");
    setContactDate(businessDateKey(new Date()));
    const previousContactType = item.lead.activities?.[0]?.contactType;
    const activityType = previousContactType
      ? CONTACT_TYPES.find((option) => option === previousContactType)
      : undefined;
    const followUpContactType =
      item.type === "Call" ? "Phone Call" : item.type;
    setContactType(
      activityType ??
        CONTACT_TYPES.find((option) => option === followUpContactType) ??
        "Phone Call",
    );
    setCustomerResponse("");
    setRequirement("");
    setMeetingChoice("");
    setCompletionErrors({});
    setMeetingDate("");
    setMeetingTime("");
    setMeetingType("");
    setSelectedNextStage("");
  }

  const completingItem =
    editing?.status === "COMPLETED"
      ? items.find((item) => item.id === editing.id)
      : undefined;
  const reschedulingItem =
    editing?.status === "RESCHEDULED"
      ? items.find((item) => item.id === editing.id)
      : undefined;

  return (
    <main className="lead-workspace follow-up-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">DAILY SALES ROUTINE</p>
          <h1>Tasks</h1>
          <p className="subtitle">
            Keep customer commitments visible and every open lead scheduled.
          </p>
        </div>
        <div className="workspace-actions">
          <Link className="secondary-action" href="/leads">
            All leads
          </Link>
          <button className="primary" onClick={() => setShowCreate(true)}>
            + Schedule task
          </button>
        </div>
      </header>
      <label className="search-field follow-up-search">
        <span aria-hidden="true">⌕</span>
        <input
          aria-label="Search tasks"
          placeholder="Search lead, phone, BDE, action, or notes"
          value={search}
          onChange={(event) => {
            resetPage();
            setSearch(event.target.value);
          }}
        />
      </label>
      <div className="follow-up-results-layout">
        <aside className="follow-up-filters" aria-label="Filter tasks">
          <h2>Filter Tasks</h2>
          <div className="follow-up-filter-options">
            <div className="follow-up-filter-option">
              <label className="follow-up-filter-checkbox">
                <input
                  type="checkbox"
                  checked={enabledFilters.type}
                  onChange={(event) =>
                    toggleFilter("type", event.target.checked)
                  }
                />
                Type
              </label>
              {enabledFilters.type && (
                <label className="follow-up-filter-input">
                  Select type *
                  <div className="follow-up-filter-checkboxes">
                    {TYPES.map((item) => (
                      <label className="follow-up-filter-checkbox" key={item}>
                        <input
                          checked={typeFilters.includes(item)}
                          onChange={(event) => {
                            resetPage();
                            setTypeFilters((current) =>
                              event.target.checked
                                ? [...current, item]
                                : current.filter((selected) => selected !== item),
                            );
                          }}
                          type="checkbox"
                        />
                        {item}
                      </label>
                    ))}
                  </div>
                </label>
              )}
            </div>
            <div className="follow-up-filter-option">
              <label className="follow-up-filter-checkbox">
                <input
                  type="checkbox"
                  checked={enabledFilters.assignee}
                  onChange={(event) =>
                    toggleFilter("assignee", event.target.checked)
                  }
                />
                Assigned BDE
              </label>
              {enabledFilters.assignee && (
                <label className="follow-up-filter-input">
                  Select BDE *
                  <div className="follow-up-filter-checkboxes">
                    {assignees.map((assignee) => (
                      <label
                        className="follow-up-filter-checkbox"
                        key={assignee.id}
                      >
                        <input
                          checked={assignedBdeIds.includes(assignee.id)}
                          onChange={(event) => {
                            resetPage();
                            setAssignedBdeIds((current) =>
                              event.target.checked
                                ? [...current, assignee.id]
                                : current.filter((id) => id !== assignee.id),
                            );
                          }}
                          type="checkbox"
                        />
                        {assignee.fullName}
                      </label>
                    ))}
                  </div>
                </label>
              )}
            </div>
            <div className="follow-up-filter-option">
              {FOLLOW_UP_STATUSES.map((item) => (
                <label className="follow-up-filter-checkbox" key={item}>
                  <input
                    checked={statusFilters.includes(item)}
                    onChange={(event) => {
                      resetPage();
                      setStatusFilters((current) =>
                        event.target.checked
                          ? [...current, item]
                          : current.filter((status) => status !== item),
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
                  type="checkbox"
                  checked={enabledFilters.date}
                  onChange={(event) =>
                    toggleFilter("date", event.target.checked)
                  }
                />
                Date
              </label>
              {enabledFilters.date && (
                <div className="follow-up-date-range">
                  <label className="follow-up-filter-input">
                    From *
                    <input
                      required
                      type="date"
                      value={from}
                      onChange={(event) => {
                        resetPage();
                        setFrom(event.target.value);
                      }}
                    />
                  </label>
                  <label className="follow-up-filter-input">
                    To *
                    <input
                      required
                      type="date"
                      min={from || undefined}
                      value={to}
                      onChange={(event) => {
                        resetPage();
                        setTo(event.target.value);
                      }}
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        <button
          className="secondary-action follow-up-clear"
          type="button"
          onClick={() => {
            resetPage();
            setEnabledFilters({
              type: false,
              assignee: false,
              date: false,
            });
            setTypeFilters([]);
            setAssignedBdeIds([]);
            setStatusFilters([]);
            setFrom("");
            setTo("");
          }}
        >
          Clear filters
        </button>
        </aside>
        <section className="follow-up-list">
        {!loading && items.length > 0 && (
          <div className="follow-up-list-header" aria-hidden="true">
            <span>Due date</span>
            <span>Lead / customer</span>
            <span>Assigned BDE</span>
            <span>Task</span>
            <span>Actions</span>
          </div>
        )}
        {loading && (
          <p className="dashboard-loading" role="status">
            Loading tasks...
          </p>
        )}
        {!loading &&
          visibleItems.map((item) => {
            const dueDay = new Date(item.dueAt);
            const todayKey = businessDateKey(new Date());
            const dueDayKey = businessDateKey(dueDay);
            const urgency =
              item.status === "PENDING" && dueDayKey < todayKey
                ? " overdue"
                : item.status === "PENDING" &&
                    dueDayKey === todayKey
                  ? " due-today"
                  : "";
            return (
              <article className={`follow-up-row${urgency}`} key={item.id}>
                <div className="follow-up-time">
                  <strong>{formatDate(item.dueAt)}</strong>
                  {urgency && (
                    <span className={`follow-up-urgency${urgency}`}>
                      {urgency.trim() === "overdue" ? "Overdue" : "Due today"}
                    </span>
                  )}
                  <span
                    className={`follow-up-status status-${item.status.toLowerCase()}`}
                  >
                    {item.status.toLowerCase()}
                  </span>
                </div>
                <div className="follow-up-customer">
                  <Link href={`/leads/${item.lead.id}`}>
                    {item.lead.customerName}
                  </Link>
                  <span>
                    {item.lead.businessName ? `${item.lead.businessName} · ` : ""}
                    {item.lead.mobileNumber}
                  </span>
                  <small className="follow-up-stage">
                    {item.lead.stage.replaceAll("_", " ")}
                  </small>
                </div>
                <div className="follow-up-assignee">
                  <span>Assigned BDE</span>
                  <strong>{item.lead.assignedBde.fullName}</strong>
                </div>
                <div className="follow-up-action">
                  <span>{item.type}</span>
                  <strong>{item.nextAction}</strong>
                  {item.remarks && <small>{item.remarks}</small>}
                </div>
                {item.status === "PENDING" && (
                  <div className="follow-up-controls">
                    <button
                      disabled={busy}
                      onClick={() => beginUpdate(item, "COMPLETED")}
                    >
                      Complete
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        {!loading && !error && items.length === 0 && (
          <div className="empty-list">No tasks match these filters.</div>
        )}
        </section>
      </div>
      {reschedulingItem && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditing(null);
          }}
        >
          <section
            className="lead-modal follow-up-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reschedule-follow-up-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">UPDATE COMMITMENT</p>
                <h2 id="reschedule-follow-up-title">Reschedule task</h2>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label="Close"
                onClick={() => setEditing(null)}
              >
                ×
              </button>
            </div>
            <form
              className="lead-form"
              onSubmit={(event) => {
                event.preventDefault();
                void updateFollowUp(reschedulingItem);
              }}
            >
              <label className="form-wide">
                Reschedule reason *
                <select
                  required
                  value={rescheduleReason}
                  onChange={(event) =>
                    setRescheduleReason(
                      event.target.value as (typeof RESCHEDULE_REASONS)[number],
                    )
                  }
                >
                  {RESCHEDULE_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-wide">
                Remarks (optional)
                <textarea
                  rows={2}
                  value={outcomeNotes}
                  onChange={(event) => setOutcomeNotes(event.target.value)}
                />
              </label>
              {!["WON", "LOST"].includes(reschedulingItem.lead.stage) && (
                <>
                  <label className="form-wide">
                    Next action *
                    <input
                      required
                      value={nextActionText}
                      onChange={(event) =>
                        setNextActionText(event.target.value)
                      }
                    />
                  </label>
                  <ClockDateTimePicker
                    className="form-wide"
                    label="Next task"
                    required
                    minValue={businessInputValue(new Date())}
                    value={nextDueAt}
                    onChange={setNextDueAt}
                  />
                </>
              )}
              <div className="form-footer">
                <p>This reason and any remarks are saved on the rescheduled task.</p>
                <button className="primary" disabled={busy}>
                  {busy ? "Saving..." : "Reschedule"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {completingItem && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditing(null);
          }}
        >
          <section
            className="lead-modal follow-up-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="complete-follow-up-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">CUSTOMER CONTACT</p>
                <h2 id="complete-follow-up-title">Complete call</h2>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label="Close"
                onClick={() => setEditing(null)}
              >
                ×
              </button>
            </div>
            <form
              className="lead-form"
              onSubmit={(event) => {
                event.preventDefault();
                void updateFollowUp(completingItem);
              }}
            >
              <label>
                Lead Name
                <input disabled value={completingItem.lead.customerName} />
              </label>
              <label>
                Contact Type
                <input disabled value={contactType} />
              </label>
              <label>
                Contact Date
                <input disabled type="date" value={contactDate} />
              </label>
              <label>
                Next Action *
                <select
                  value={selectedNextStage}
                  aria-invalid={!!completionErrors.nextAction}
                  onChange={(event) => {
                    const stage = event.target.value as NextLeadStage | "";
                    setSelectedNextStage(stage);
                    setMeetingChoice("");
                    setMeetingDate("");
                    setMeetingTime("");
                    setMeetingType("");
                    setCompletionErrors({});
                  }}
                >
                  <option value="">Choose next action</option>
                  <option value="INTERESTED">Interested</option>
                  {completingItem.type === "Proposal Follow-up" &&
                    completingItem.lead.stage === "MEETING" && (
                      <option value="PROPOSAL">Proposal</option>
                    )}
                  <option value="LOST">Not Interested</option>
                  {!(completingItem.type === "Proposal Follow-up" &&
                    completingItem.lead.stage === "MEETING") && (
                    <option value="CONTACTED">Decision Pending</option>
                  )}
                </select>
                {completionErrors.nextAction && (
                  <small className="field-error">
                    {completionErrors.nextAction}
                  </small>
                )}
              </label>
              {selectedNextStage !== "LOST" && (
                <>
                  <label className="form-wide">
                    Next Customer Response *
                    <textarea
                      aria-invalid={!!completionErrors.customerResponse}
                      rows={3}
                      value={customerResponse}
                      onChange={(event) => {
                        setCustomerResponse(event.target.value);
                        setCompletionErrors((errors) => ({
                          ...errors,
                          customerResponse: undefined,
                        }));
                      }}
                    />
                    {completionErrors.customerResponse && (
                      <small className="field-error">
                        {completionErrors.customerResponse}
                      </small>
                    )}
                  </label>
                  <label className="form-wide">
                    Requirements *
                    <textarea
                      aria-invalid={!!completionErrors.requirement}
                      rows={2}
                      value={requirement}
                      onChange={(event) => {
                        setRequirement(event.target.value);
                        setCompletionErrors((errors) => ({
                          ...errors,
                          requirement: undefined,
                        }));
                      }}
                    />
                    {completionErrors.requirement && (
                      <small className="field-error">
                        {completionErrors.requirement}
                      </small>
                    )}
                  </label>
                </>
              )}
              <label className="form-wide">
                Remarks
                <textarea
                  rows={2}
                  value={outcomeNotes}
                  onChange={(event) => setOutcomeNotes(event.target.value)}
                />
              </label>
              {selectedNextStage === "INTERESTED" && (
                <div className="form-wide meeting-schedule-control">
                  <span>Schedule a meeting?</span>
                  <div className="meeting-choice-buttons">
                    <button
                      className={
                        meetingChoice === "yes"
                          ? "primary"
                          : "secondary-action"
                      }
                      type="button"
                      aria-pressed={meetingChoice === "yes"}
                      onClick={() => {
                        setMeetingChoice("yes");
                        setCompletionErrors((errors) => ({
                          ...errors,
                          meetingChoice: undefined,
                        }));
                      }}
                    >
                      Yes
                    </button>
                    <button
                      className={
                        meetingChoice === "no"
                          ? "primary"
                          : "secondary-action"
                      }
                      type="button"
                      aria-pressed={meetingChoice === "no"}
                      onClick={() => {
                        setMeetingChoice("no");
                        setMeetingDate("");
                        setMeetingTime("");
                        setMeetingType("");
                        setCompletionErrors((errors) => ({
                          ...errors,
                          meetingChoice: undefined,
                          meetingDate: undefined,
                          meetingTime: undefined,
                          meetingType: undefined,
                        }));
                      }}
                    >
                      No
                    </button>
                  </div>
                  {completionErrors.meetingChoice && (
                    <small className="field-error">
                      {completionErrors.meetingChoice}
                    </small>
                  )}
                </div>
              )}
              <div className="form-footer">
                <p>Save the contact outcome and update this lead.</p>
                <div>
                  <button
                    className="secondary-action"
                    disabled={busy}
                    onClick={() => setEditing(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button className="primary" disabled={busy}>
                    {busy ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            </form>
          </section>
          {selectedNextStage === "INTERESTED" &&
            meetingChoice === "yes" && (
              <aside
                className="meeting-side-drawer is-open"
                role="dialog"
                aria-modal="false"
                aria-labelledby="schedule-interested-meeting-title"
              >
                <fieldset>
                  <div className="modal-heading">
                    <div>
                      <p className="eyebrow">INTERESTED LEAD</p>
                      <h2 id="schedule-interested-meeting-title">
                        Schedule meeting
                      </h2>
                    </div>
                  </div>
                  <div className="lead-form">
                    <label>
                      Meeting Date *
                      <input
                        aria-invalid={!!completionErrors.meetingDate}
                        type="date"
                        min={businessDateKey(new Date())}
                        value={meetingDate}
                        onChange={(event) => {
                          setMeetingDate(event.target.value);
                          setCompletionErrors((errors) => ({
                            ...errors,
                            meetingDate: undefined,
                          }));
                        }}
                      />
                      {completionErrors.meetingDate && (
                        <small className="field-error">
                          {completionErrors.meetingDate}
                        </small>
                      )}
                    </label>
                    <label>
                      Meeting Time *
                      <input
                        aria-invalid={!!completionErrors.meetingTime}
                        type="time"
                        value={meetingTime}
                        onChange={(event) => {
                          setMeetingTime(event.target.value);
                          setCompletionErrors((errors) => ({
                            ...errors,
                            meetingTime: undefined,
                          }));
                        }}
                      />
                      {completionErrors.meetingTime && (
                        <small className="field-error">
                          {completionErrors.meetingTime}
                        </small>
                      )}
                    </label>
                    <label>
                      Meeting type *
                      <select
                        aria-invalid={!!completionErrors.meetingType}
                        value={meetingType}
                        onChange={(event) => {
                          setMeetingType(event.target.value);
                          setCompletionErrors((errors) => ({
                            ...errors,
                            meetingType: undefined,
                          }));
                        }}
                      >
                        <option value="">Choose meeting type</option>
                        {MEETING_TYPES.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      {completionErrors.meetingType && (
                        <small className="field-error">
                          {completionErrors.meetingType}
                        </small>
                      )}
                    </label>
                  </div>
                  <div className="form-footer">
                    <p>
                      Meeting details are saved with the lead stage update.
                    </p>
                  </div>
                </fieldset>
              </aside>
            )}
        </div>
      )}
      {!loading && !error && (
        <nav className="pagination" aria-label="Task pagination">
          <span>
            {items.length} {items.length === 1 ? "task" : "tasks"} ·
            Page {page} of {totalPages}
          </span>
          <div className="pagination-controls">
            <button
              className="secondary-action"
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
            >
              Previous
            </button>
            <strong>{page} / {totalPages}</strong>
            <button
              className="secondary-action"
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page === totalPages}
            >
              Next
            </button>
          </div>
        </nav>
      )}
      {showCreate && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowCreate(false);
          }}
        >
          <section
            className="lead-modal follow-up-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="follow-up-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">CUSTOMER COMMITMENT</p>
                <h2 id="follow-up-title">Schedule task</h2>
              </div>
              <button
                className="modal-close"
                aria-label="Close"
                onClick={() => setShowCreate(false)}
              >
                ×
              </button>
            </div>
            <form className="lead-form" onSubmit={createFollowUp}>
              <label className="form-wide">
                Lead *
                <select
                  required
                  value={leadId}
                  onChange={(event) => setLeadId(event.target.value)}
                >
                  <option value="">Select lead</option>
                  {leads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.customerName} · {lead.assignedBde.fullName}
                    </option>
                  ))}
                </select>
                {leads.length === 0 && (
                  <small>No open leads are available in your authorized scope.</small>
                )}
              </label>
              <label>
                Task type
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                >
                  {TYPES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <ClockDateTimePicker
                className="form-wide"
                label="Due"
                required
                value={dueAt}
                onChange={setDueAt}
              />
              <label className="form-wide">
                Next action *
                <input
                  required
                  value={nextAction}
                  onChange={(event) => setNextAction(event.target.value)}
                />
              </label>
              <label className="form-wide">
                Remarks
                <textarea
                  rows={2}
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                />
              </label>
              <div className="form-footer">
                <p>Scheduling updates the lead’s current next action.</p>
                <button className="primary" disabled={busy || leads.length === 0}>
                  {busy ? "Saving..." : "Schedule"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
