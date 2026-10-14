"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "../../lib/api-client";

type LeadOption = {
  id: string;
  customerName: string;
  stage: string;
  assignedBde: { fullName: string };
};
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
  };
};
type FollowUpSummary = {
  dueToday: number;
  upcoming: number;
  overdue: number;
  completed: number;
};
type Scope = "today" | "upcoming" | "overdue" | "completed";
type FollowUpStatus = FollowUp["status"];
const TYPES = [
  "Call",
  "WhatsApp",
  "Meeting",
  "Demo",
  "Email",
  "Proposal Follow-up",
  "Negotiation",
  "Other",
];
const BUSINESS_TIME_ZONE = "Asia/Kolkata";
const businessDateTimeParts = (date: Date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en", {
      timeZone: BUSINESS_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
const businessInputValue = (date: Date) => {
  const parts = businessDateTimeParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
};
const businessDateTimeIso = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Enter a valid follow-up date and time.");
  const [, year, month, day, hour, minute] = match.map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const zonedParts = businessDateTimeParts(new Date(utcGuess));
  const representedUtc = Date.UTC(
    zonedParts.year,
    zonedParts.month - 1,
    zonedParts.day,
    zonedParts.hour,
    zonedParts.minute,
  );
  return new Date(utcGuess - (representedUtc - utcGuess)).toISOString();
};
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(new Date(value));
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
  const [scope, setScope] = useState<Scope>("today");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<FollowUp[]>([]);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [summary, setSummary] = useState<FollowUpSummary>({
    dueToday: 0,
    upcoming: 0,
    overdue: 0,
    completed: 0,
  });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [assignedBdeId, setAssignedBdeId] = useState("");
  const [statusFilter, setStatusFilter] = useState<FollowUpStatus | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leadId, setLeadId] = useState("");
  const [dueAt, setDueAt] = useState(
    businessInputValue(new Date(Date.now() + 86400000)),
  );
  const [type, setType] = useState("Call");
  const [nextAction, setNextAction] = useState("");
  const [remarks, setRemarks] = useState("");
  const [editing, setEditing] = useState<{
    id: string;
    status: FollowUp["status"];
  } | null>(null);
  const [nextDueAt, setNextDueAt] = useState("");
  const [nextActionText, setNextActionText] = useState("");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const listRequestId = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++listRequestId.current;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ scope });
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (typeFilter) params.set("type", typeFilter);
    if (assignedBdeId) params.set("assignedBdeId", assignedBdeId);
    if (statusFilter) params.set("status", statusFilter);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    try {
      const followUps = await apiClient<FollowUp[]>(`/follow-ups?${params}`);
      if (requestId === listRequestId.current) setItems(followUps);
    } catch (reason) {
      if (requestId === listRequestId.current) {
        setItems([]);
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load follow-ups.",
        );
      }
    } finally {
      if (requestId === listRequestId.current) setLoading(false);
    }
  }, [assignedBdeId, debouncedSearch, from, scope, statusFilter, to, typeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    Promise.all([
      apiClient<FollowUpSummary>("/follow-ups/summary"),
      apiClient<LeadOption[]>("/leads"),
      apiClient<Assignee[]>("/leads/assignees"),
    ])
      .then(([counts, leadRows, authorizedAssignees]) => {
        setSummary(counts);
        setLeads(
          leadRows.filter((lead) => !["WON", "LOST"].includes(lead.stage)),
        );
        setAssignees(authorizedAssignees);
      })
      .catch((reason: unknown) => {
        setError(
          reason instanceof Error
            ? reason.message
            : "Unable to load follow-up summary and options.",
        );
      })
      .finally(() => setSummaryLoading(false));
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
      setNotice("Follow-up scheduled.");
      setPage(1);
      await Promise.all([load(), refreshSummary()]);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to schedule follow-up.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateFollowUp(item: FollowUp) {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      await apiClient<FollowUp>(`/follow-ups/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: editing.status,
          dueAt:
            nextDueAt && nextActionText.trim()
              ? businessDateTimeIso(nextDueAt)
              : undefined,
          nextAction: nextActionText.trim() || undefined,
          remarks: outcomeNotes.trim() || undefined,
        }),
      });
      const nextStatus = editing.status;
      setEditing(null);
      setOutcomeNotes("");
      setPage(1);
      setNotice(
        nextStatus === "COMPLETED"
          ? "Follow-up completed."
          : "Follow-up rescheduled with one successor action.",
      );
      await Promise.all([load(), refreshSummary()]);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Unable to update follow-up.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function refreshSummary() {
    try {
      const counts = await apiClient<FollowUpSummary>("/follow-ups/summary");
      setSummary(counts);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to refresh follow-up summary.",
      );
    }
  }

  function beginUpdate(item: FollowUp, status: FollowUpStatus) {
    setEditing({ id: item.id, status });
    setNextDueAt(businessInputValue(new Date(Date.now() + 86400000)));
    setNextActionText(status === "RESCHEDULED" ? item.nextAction : "");
    setOutcomeNotes(item.remarks ?? "");
  }

  const scopes: [Scope, string][] = [
    ["today", "Today"],
    ["upcoming", "Upcoming"],
    ["overdue", "Overdue"],
    ["completed", "Completed"],
  ];

  return (
    <main className="lead-workspace follow-up-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">DAILY SALES ROUTINE</p>
          <h1>Follow-ups</h1>
          <p className="subtitle">
            Keep customer commitments visible and every open lead scheduled.
          </p>
        </div>
        <div className="workspace-actions">
          <Link className="secondary-action" href="/leads">
            All leads
          </Link>
          <button className="primary" onClick={() => setShowCreate(true)}>
            + Schedule follow-up
          </button>
        </div>
      </header>
      {error && (
        <div className="workspace-notice" role="alert">
          {error}
          <button onClick={() => setError("")} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}
      {notice && (
        <div className="workspace-notice" role="status">
          {notice}
          <button onClick={() => setNotice("")} aria-label="Dismiss notice">
            ×
          </button>
        </div>
      )}
      <section className="follow-up-summary" aria-label="Follow-up summary">
        {(
          [
            ["today", "Due Today", summary.dueToday],
            ["upcoming", "Upcoming", summary.upcoming],
            ["overdue", "Overdue", summary.overdue],
            ["completed", "Completed", summary.completed],
          ] as const
        ).map(([value, label, count]) => (
          <button
            className={`follow-up-summary-card follow-up-summary-${value}${scope === value ? " active" : ""}`}
            type="button"
            key={value}
            onClick={() => {
              setPage(1);
              setStatusFilter("");
              setScope(value);
            }}
          >
            <span>{label}</span>
            <strong>{summaryLoading ? "—" : count}</strong>
          </button>
        ))}
      </section>
      <div className="follow-up-tabs" role="tablist">
        {scopes.map(([value, label]) => (
          <button
            key={value}
            className={scope === value ? "active" : ""}
            role="tab"
            aria-selected={scope === value}
            onClick={() => {
              setPage(1);
              setStatusFilter("");
              setScope(value);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="follow-up-filters">
        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="Search follow-ups"
            placeholder="Search lead, phone, BDE, action, or notes"
            value={search}
            onChange={(event) => {
              resetPage();
              setSearch(event.target.value);
            }}
          />
        </label>
        <label>
          Type
          <select
            value={typeFilter}
            onChange={(event) => {
              resetPage();
              setTypeFilter(event.target.value);
            }}
          >
            <option value="">All types</option>
            {TYPES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          Assigned BDE
          <select
            value={assignedBdeId}
            onChange={(event) => {
              resetPage();
              setAssignedBdeId(event.target.value);
            }}
          >
            <option value="">All authorized BDEs</option>
            {assignees.map((assignee) => (
              <option key={assignee.id} value={assignee.id}>
                {assignee.fullName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={statusFilter}
            onChange={(event) => {
              resetPage();
              setStatusFilter(event.target.value as FollowUpStatus | "");
            }}
          >
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="COMPLETED">Completed</option>
            <option value="RESCHEDULED">Rescheduled</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </label>
        <label>
          From
          <input
            type="date"
            value={from}
            onChange={(event) => {
              resetPage();
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
              resetPage();
              setTo(event.target.value);
            }}
          />
        </label>
        <button
          className="secondary-action follow-up-clear"
          type="button"
          onClick={() => {
            resetPage();
            setSearch("");
            setTypeFilter("");
            setAssignedBdeId("");
            setStatusFilter("");
            setFrom("");
            setTo("");
          }}
        >
          Clear filters
        </button>
      </div>
      <section className="follow-up-list">
        {!loading && items.length > 0 && (
          <div className="follow-up-list-header" aria-hidden="true">
            <span>Due date</span>
            <span>Lead / customer</span>
            <span>Assigned BDE</span>
            <span>Follow-up</span>
            <span>Actions</span>
          </div>
        )}
        {loading && (
          <p className="dashboard-loading" role="status">
            Loading follow-ups...
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
                    {!["WON", "LOST"].includes(item.lead.stage) && (
                      <button
                        disabled={busy}
                        onClick={() => beginUpdate(item, "RESCHEDULED")}
                      >
                        Reschedule
                      </button>
                    )}
                  </div>
                )}
                {editing?.id === item.id && (
                  <form
                    className="follow-up-edit"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void updateFollowUp(item);
                    }}
                  >
                    <p className="follow-up-edit-guidance">
                      {editing.status === "COMPLETED"
                        ? "Complete this follow-up and record its outcome."
                        : "Close this follow-up and schedule one successor follow-up."}
                    </p>
                    {!["WON", "LOST"].includes(item.lead.stage) && (
                      <>
                        <label>
                          Next action for open lead *
                          <input
                            required
                            value={nextActionText}
                            onChange={(event) =>
                              setNextActionText(event.target.value)
                            }
                          />
                        </label>
                        <label>
                          Next follow-up date and time *
                          <input
                            required
                            type="datetime-local"
                            min={businessInputValue(new Date())}
                            value={nextDueAt}
                            onChange={(event) => setNextDueAt(event.target.value)}
                          />
                        </label>
                      </>
                    )}
                    <label className="follow-up-outcome">
                      Outcome / notes
                      <textarea
                        rows={2}
                        value={outcomeNotes}
                        onChange={(event) => setOutcomeNotes(event.target.value)}
                      />
                    </label>
                    <button className="primary" disabled={busy}>
                      {busy
                        ? "Saving..."
                        : `Save ${editing.status.toLowerCase()}`}
                    </button>
                    <button
                      type="button"
                      className="cancel-stage"
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </button>
                  </form>
                )}
              </article>
            );
          })}
        {!loading && !error && items.length === 0 && (
          <div className="empty-list">No follow-ups match these filters.</div>
        )}
      </section>
      {!loading && !error && (
        <nav className="pagination" aria-label="Follow-up pagination">
          <span>
            {items.length} {items.length === 1 ? "follow-up" : "follow-ups"} ·
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
                <h2 id="follow-up-title">Schedule follow-up</h2>
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
                Follow-up type
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                >
                  {TYPES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Due date and time *
                <input
                  required
                  type="datetime-local"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                />
              </label>
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
