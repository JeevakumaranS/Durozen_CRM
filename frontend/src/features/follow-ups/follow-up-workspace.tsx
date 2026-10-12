"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { apiClient } from "../../lib/api-client";

type LeadOption = {
  id: string;
  customerName: string;
  stage: string;
  assignedBde: { fullName: string };
};
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
    mobileNumber: string;
    stage: string;
    assignedBde: { fullName: string };
  };
};
type Scope = "today" | "upcoming" | "overdue" | "completed";
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
const localInputValue = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export function FollowUpWorkspace() {
  const [scope, setScope] = useState<Scope>("today");
  const [items, setItems] = useState<FollowUp[]>([]);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [notice, setNotice] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leadId, setLeadId] = useState("");
  const [dueAt, setDueAt] = useState(
    localInputValue(new Date(Date.now() + 86400000)),
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

  async function load() {
    try {
      const [followUps, leadRows] = await Promise.all([
        apiClient<FollowUp[]>(`/follow-ups?scope=${scope}`),
        apiClient<LeadOption[]>("/leads"),
      ]);
      setItems(followUps);
      setLeads(
        leadRows.filter((lead) => !["WON", "LOST"].includes(lead.stage)),
      );
      setNotice("");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Unable to load follow-ups.",
      );
    }
  }

  useEffect(() => {
    void load();
  }, [scope]);

  async function createFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await apiClient<FollowUp>("/follow-ups", {
        method: "POST",
        body: JSON.stringify({
          leadId,
          dueAt: new Date(dueAt).toISOString(),
          type,
          nextAction,
          remarks: remarks || undefined,
        }),
      });
      setShowCreate(false);
      setNextAction("");
      setRemarks("");
      setNotice("Follow-up scheduled.");
      await load();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Unable to schedule follow-up.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateFollowUp(item: FollowUp) {
    if (!editing) return;
    setBusy(true);
    try {
      await apiClient<FollowUp>(`/follow-ups/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: editing.status,
          dueAt: nextDueAt ? new Date(nextDueAt).toISOString() : undefined,
          nextAction: nextActionText || undefined,
        }),
      });
      setEditing(null);
      setNotice(`Follow-up marked ${editing.status.toLowerCase()}.`);
      await load();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Unable to update follow-up.",
      );
    } finally {
      setBusy(false);
    }
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
      {notice && (
        <div className="workspace-notice" role="status">
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}
      <div className="follow-up-tabs" role="tablist">
        {scopes.map(([value, label]) => (
          <button
            key={value}
            className={scope === value ? "active" : ""}
            role="tab"
            aria-selected={scope === value}
            onClick={() => setScope(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <section className="follow-up-list">
        {items.map((item) => (
          <article className="follow-up-row" key={item.id}>
            <div className="follow-up-time">
              <strong>{formatDate(item.dueAt)}</strong>
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
                {item.lead.mobileNumber} · {item.lead.assignedBde.fullName}
              </span>
            </div>
            <div className="follow-up-action">
              <span>{item.type}</span>
              <strong>{item.nextAction}</strong>
              {item.remarks && <small>{item.remarks}</small>}
            </div>
            {item.status === "PENDING" && (
              <div className="follow-up-controls">
                <button
                  onClick={() => {
                    setEditing({ id: item.id, status: "COMPLETED" });
                    setNextDueAt(
                      localInputValue(new Date(Date.now() + 86400000)),
                    );
                    setNextActionText("");
                  }}
                >
                  Complete
                </button>
                <button
                  onClick={() => {
                    setEditing({ id: item.id, status: "RESCHEDULED" });
                    setNextDueAt(
                      localInputValue(new Date(Date.now() + 86400000)),
                    );
                    setNextActionText(item.nextAction);
                  }}
                >
                  Reschedule
                </button>
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
                {!["WON", "LOST"].includes(item.lead.stage) && (
                  <>
                    <label>
                      Next action
                      <input
                        required
                        value={nextActionText}
                        onChange={(event) =>
                          setNextActionText(event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Next follow-up
                      <input
                        required
                        type="datetime-local"
                        value={nextDueAt}
                        onChange={(event) => setNextDueAt(event.target.value)}
                      />
                    </label>
                  </>
                )}
                <button className="primary" disabled={busy}>
                  {busy ? "Saving..." : `Save ${editing.status.toLowerCase()}`}
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
        ))}
        {items.length === 0 && (
          <div className="empty-list">No {scope} follow-ups.</div>
        )}
      </section>
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
                <button
                  className="primary"
                  disabled={busy || leads.length === 0}
                >
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
