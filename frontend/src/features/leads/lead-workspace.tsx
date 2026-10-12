"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { apiClient } from "../../lib/api-client";

const STAGES = [
  "NEW_LEAD",
  "CONTACTED",
  "INTERESTED",
  "MEETING",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
] as const;
const SOURCES = [
  "Website",
  "WhatsApp",
  "Instagram",
  "Facebook",
  "Google",
  "Referral",
  "Direct Call",
  "Walk-in",
  "BDE Prospecting",
  "Existing Customer",
  "Other",
];
const PRIORITIES = ["HOT", "WARM", "COLD"] as const;
const LOST_REASONS = [
  "Price Too High",
  "Customer Selected Competitor",
  "Budget Not Available",
  "Requirement Cancelled",
  "No Response",
  "Not Interested",
  "Project Postponed",
  "Requirement Changed",
  "Duplicate Lead",
  "Other",
];
const PAYMENT_STATUSES = [
  "Advance Pending",
  "Partially Paid",
  "Paid",
  "Pending",
];

type Stage = (typeof STAGES)[number];
type Priority = (typeof PRIORITIES)[number];
type Lead = {
  id: string;
  leadNumber: string;
  customerName: string;
  businessName?: string | null;
  mobileNumber: string;
  requirement?: string | null;
  estimatedBudget?: string | number | null;
  priority: Priority;
  stage: Stage;
  nextAction?: string | null;
  followUpAt?: string | null;
  createdAt: string;
  assignedBde: { id: string; fullName: string };
};
type Assignee = { id: string; fullName: string; role: string };
type LeadForm = {
  customerName: string;
  businessName: string;
  mobileNumber: string;
  email: string;
  location: string;
  businessCategory: string;
  requirement: string;
  estimatedBudget: string;
  leadSource: string;
  priority: Priority;
  assignedBdeId: string;
  nextAction: string;
  followUpAt: string;
};

const emptyForm: LeadForm = {
  customerName: "",
  businessName: "",
  mobileNumber: "",
  email: "",
  location: "",
  businessCategory: "",
  requirement: "",
  estimatedBudget: "",
  leadSource: "Website",
  priority: "WARM",
  assignedBdeId: "",
  nextAction: "",
  followUpAt: "",
};

function stageName(stage: Stage) {
  return stage.replaceAll("_", " ");
}

function displayDate(value?: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function displayMoney(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export function LeadWorkspace({ view }: { view: "leads" | "pipeline" }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [form, setForm] = useState<LeadForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [stageEdit, setStageEdit] = useState<{
    leadId: string;
    stage: Stage;
  } | null>(null);
  const [finalDealValue, setFinalDealValue] = useState("");
  const [wonService, setWonService] = useState("");
  const [paymentStatus, setPaymentStatus] = useState(PAYMENT_STATUSES[0]);
  const [expectedStartDate, setExpectedStartDate] = useState("");
  const [wonRemarks, setWonRemarks] = useState("");
  const [lostReasonType, setLostReasonType] = useState(LOST_REASONS[0]);
  const [otherLostReason, setOtherLostReason] = useState("");

  async function load() {
    try {
      const [leadRows, users] = await Promise.all([
        apiClient<Lead[]>("/leads"),
        apiClient<Assignee[]>("/leads/assignees"),
      ]);
      setLeads(leadRows);
      setAssignees(users);
      setNotice("");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Unable to load leads.",
      );
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await apiClient<Lead>("/leads", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          email: form.email || undefined,
          estimatedBudget: form.estimatedBudget
            ? Number(form.estimatedBudget)
            : undefined,
          followUpAt: new Date(form.followUpAt).toISOString(),
        }),
      });
      setForm({ ...emptyForm, assignedBdeId: assignees[0]?.id ?? "" });
      setShowForm(false);
      setNotice("Lead created and added to New Lead.");
      await load();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Unable to create lead.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveStage(lead: Lead) {
    if (!stageEdit) return;
    const lostReason =
      lostReasonType === "Other" ? otherLostReason.trim() : lostReasonType;
    if (stageEdit.stage === "WON" && !finalDealValue.trim()) {
      setNotice("Enter a final deal value before marking this lead as won.");
      return;
    }
    if (stageEdit.stage === "WON" && !wonService.trim()) {
      setNotice(
        "Enter the service or project before marking this lead as won.",
      );
      return;
    }
    if (stageEdit.stage === "LOST" && !lostReason) {
      setNotice("Enter a lost reason before closing this lead.");
      return;
    }
    setBusy(true);
    try {
      await apiClient<Lead>(`/leads/${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          stage: stageEdit.stage,
          nextAction: lead.nextAction,
          followUpAt: lead.followUpAt,
          finalDealValue:
            stageEdit.stage === "WON" ? Number(finalDealValue) : undefined,
          wonService: stageEdit.stage === "WON" ? wonService : undefined,
          paymentStatus: stageEdit.stage === "WON" ? paymentStatus : undefined,
          expectedStartDate:
            stageEdit.stage === "WON" && expectedStartDate
              ? new Date(expectedStartDate).toISOString()
              : undefined,
          wonRemarks: stageEdit.stage === "WON" ? wonRemarks : undefined,
          lostReason: stageEdit.stage === "LOST" ? lostReason : undefined,
        }),
      });
      setStageEdit(null);
      setFinalDealValue("");
      setWonService("");
      setPaymentStatus(PAYMENT_STATUSES[0]);
      setExpectedStartDate("");
      setWonRemarks("");
      setLostReasonType(LOST_REASONS[0]);
      setOtherLostReason("");
      setNotice(`Lead moved to ${stageName(stageEdit.stage)}.`);
      await load();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Unable to update stage.",
      );
    } finally {
      setBusy(false);
    }
  }

  const filtered = leads.filter((lead) =>
    [
      lead.customerName,
      lead.businessName,
      lead.mobileNumber,
      lead.assignedBde.fullName,
    ].some((value) => value?.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <main className="lead-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">SALES WORKSPACE</p>
          <h1>{view === "pipeline" ? "Sales pipeline" : "Leads"}</h1>
          <p className="subtitle">
            {view === "pipeline"
              ? "Move every opportunity toward a clear next step."
              : "Capture, assign, and keep every active lead moving."}
          </p>
        </div>
        <div className="workspace-actions">
          <Link
            className="secondary-action"
            href={view === "pipeline" ? "/leads" : "/pipeline"}
          >
            {view === "pipeline" ? "Lead list" : "Pipeline board"}
          </Link>
          <button className="primary" onClick={() => setShowForm(true)}>
            + Add lead
          </button>
        </div>
      </header>

      {notice && (
        <div className="workspace-notice" role="status">
          {notice}
          <button aria-label="Dismiss notice" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}

      <div className="workspace-toolbar">
        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="Search leads"
            placeholder="Search customer, company, BDE..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <span className="result-count">
          {filtered.length} {filtered.length === 1 ? "lead" : "leads"}
        </span>
      </div>

      {view === "pipeline" ? (
        <div className="kanban-board">
          {STAGES.map((stage) => {
            const stageLeads = filtered.filter((lead) => lead.stage === stage);
            return (
              <section className="kanban-column" key={stage}>
                <div className="kanban-heading">
                  <h2>{stageName(stage)}</h2>
                  <span>{stageLeads.length}</span>
                </div>
                <div className="kanban-cards">
                  {stageLeads.map((lead) => (
                    <article className="lead-card" key={lead.id}>
                      <div className="lead-card-top">
                        <span
                          className={`priority priority-${lead.priority.toLowerCase()}`}
                        >
                          {lead.priority}
                        </span>
                        <small>{lead.leadNumber}</small>
                      </div>
                      <Link
                        className="lead-card-name"
                        href={`/leads/${lead.id}`}
                      >
                        {lead.customerName}
                      </Link>
                      <p className="lead-card-company">
                        {lead.businessName ||
                          lead.requirement ||
                          "No company or requirement"}
                      </p>
                      <div className="lead-card-meta">
                        <span>BDE</span>
                        <strong>{lead.assignedBde.fullName}</strong>
                      </div>
                      <div className="lead-card-meta">
                        <span>Budget</span>
                        <strong>{displayMoney(lead.estimatedBudget)}</strong>
                      </div>
                      <div className="lead-card-meta">
                        <span>Next follow-up</span>
                        <strong>{displayDate(lead.followUpAt)}</strong>
                      </div>
                      <p className="lead-card-action">
                        {lead.nextAction || "Next action not set"}
                      </p>
                      <label className="stage-select-label">
                        Move stage
                        <select
                          value={
                            stageEdit?.leadId === lead.id
                              ? stageEdit.stage
                              : lead.stage
                          }
                          onChange={(event) => {
                            const target = event.target.value as Stage;
                            if (target !== lead.stage)
                              setStageEdit({ leadId: lead.id, stage: target });
                          }}
                        >
                          {STAGES.map((item) => (
                            <option key={item} value={item}>
                              {stageName(item)}
                            </option>
                          ))}
                        </select>
                      </label>
                      {stageEdit?.leadId === lead.id && (
                        <div className="transition-editor">
                          {stageEdit.stage === "WON" && (
                            <>
                              <label>
                                Service / project
                                <input
                                  required
                                  value={wonService}
                                  onChange={(event) =>
                                    setWonService(event.target.value)
                                  }
                                />
                              </label>
                              <label>
                                Final deal value
                                <input
                                  min="0"
                                  type="number"
                                  value={finalDealValue}
                                  onChange={(event) =>
                                    setFinalDealValue(event.target.value)
                                  }
                                />
                              </label>
                              <label>
                                Payment status
                                <select
                                  value={paymentStatus}
                                  onChange={(event) =>
                                    setPaymentStatus(event.target.value)
                                  }
                                >
                                  {PAYMENT_STATUSES.map((status) => (
                                    <option key={status}>{status}</option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                Expected start date
                                <input
                                  type="date"
                                  value={expectedStartDate}
                                  onChange={(event) =>
                                    setExpectedStartDate(event.target.value)
                                  }
                                />
                              </label>
                              <label>
                                Deal remarks
                                <input
                                  value={wonRemarks}
                                  onChange={(event) =>
                                    setWonRemarks(event.target.value)
                                  }
                                />
                              </label>
                            </>
                          )}
                          {stageEdit.stage === "LOST" && (
                            <>
                              <label>
                                Lost reason
                                <select
                                  value={lostReasonType}
                                  onChange={(event) =>
                                    setLostReasonType(event.target.value)
                                  }
                                >
                                  {LOST_REASONS.map((reason) => (
                                    <option key={reason}>{reason}</option>
                                  ))}
                                </select>
                              </label>
                              {lostReasonType === "Other" && (
                                <label>
                                  Other reason
                                  <input
                                    required
                                    value={otherLostReason}
                                    onChange={(event) =>
                                      setOtherLostReason(event.target.value)
                                    }
                                  />
                                </label>
                              )}
                            </>
                          )}
                          <div>
                            <button
                              disabled={busy}
                              onClick={() => void saveStage(lead)}
                            >
                              Save stage
                            </button>
                            <button
                              className="cancel-stage"
                              onClick={() => setStageEdit(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                  {stageLeads.length === 0 && (
                    <p className="empty-column">No leads</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="lead-table-wrap">
          <table className="lead-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Company / Requirement</th>
                <th>Stage</th>
                <th>Priority</th>
                <th>Assigned BDE</th>
                <th>Next follow-up</th>
                <th>Budget</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead) => (
                <tr key={lead.id}>
                  <td>
                    <Link href={`/leads/${lead.id}`}>{lead.customerName}</Link>
                    <small>{lead.mobileNumber}</small>
                  </td>
                  <td>{lead.businessName || lead.requirement || "—"}</td>
                  <td>
                    <span className="stage-pill">{stageName(lead.stage)}</span>
                  </td>
                  <td>
                    <span
                      className={`priority priority-${lead.priority.toLowerCase()}`}
                    >
                      {lead.priority}
                    </span>
                  </td>
                  <td>{lead.assignedBde.fullName}</td>
                  <td>
                    {displayDate(lead.followUpAt)}
                    <small>{lead.nextAction}</small>
                  </td>
                  <td>{displayMoney(lead.estimatedBudget)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="empty-list">
              No leads found. Add a lead to start tracking your pipeline.
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowForm(false);
          }}
        >
          <section
            className="lead-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-lead-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">NEW OPPORTUNITY</p>
                <h2 id="new-lead-title">Add lead</h2>
              </div>
              <button
                className="modal-close"
                aria-label="Close"
                onClick={() => setShowForm(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={createLead} className="lead-form">
              <label>
                Customer name *
                <input
                  required
                  value={form.customerName}
                  onChange={(event) =>
                    setForm({ ...form, customerName: event.target.value })
                  }
                />
              </label>
              <label>
                Business name
                <input
                  value={form.businessName}
                  onChange={(event) =>
                    setForm({ ...form, businessName: event.target.value })
                  }
                />
              </label>
              <label>
                Mobile number *
                <input
                  required
                  type="tel"
                  value={form.mobileNumber}
                  onChange={(event) =>
                    setForm({ ...form, mobileNumber: event.target.value })
                  }
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                />
              </label>
              <label>
                Location
                <input
                  value={form.location}
                  onChange={(event) =>
                    setForm({ ...form, location: event.target.value })
                  }
                />
              </label>
              <label>
                Business category
                <input
                  value={form.businessCategory}
                  onChange={(event) =>
                    setForm({ ...form, businessCategory: event.target.value })
                  }
                />
              </label>
              <label>
                Lead source *
                <select
                  required
                  value={form.leadSource}
                  onChange={(event) =>
                    setForm({ ...form, leadSource: event.target.value })
                  }
                >
                  {SOURCES.map((source) => (
                    <option key={source}>{source}</option>
                  ))}
                </select>
              </label>
              <label>
                Assigned BDE *
                <select
                  required
                  value={form.assignedBdeId}
                  onChange={(event) =>
                    setForm({ ...form, assignedBdeId: event.target.value })
                  }
                >
                  <option value="">Select owner</option>
                  {assignees.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select
                  value={form.priority}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      priority: event.target.value as Priority,
                    })
                  }
                >
                  {PRIORITIES.map((priority) => (
                    <option key={priority}>{priority}</option>
                  ))}
                </select>
              </label>
              <label>
                Estimated budget
                <input
                  min="0"
                  type="number"
                  value={form.estimatedBudget}
                  onChange={(event) =>
                    setForm({ ...form, estimatedBudget: event.target.value })
                  }
                />
              </label>
              <label className="form-wide">
                Requirement
                <textarea
                  rows={2}
                  value={form.requirement}
                  onChange={(event) =>
                    setForm({ ...form, requirement: event.target.value })
                  }
                />
              </label>
              <label className="form-wide">
                Next action *
                <input
                  required
                  value={form.nextAction}
                  onChange={(event) =>
                    setForm({ ...form, nextAction: event.target.value })
                  }
                  placeholder="e.g. Call to understand project scope"
                />
              </label>
              <label className="form-wide">
                Follow-up date *
                <input
                  required
                  type="datetime-local"
                  value={form.followUpAt}
                  onChange={(event) =>
                    setForm({ ...form, followUpAt: event.target.value })
                  }
                />
              </label>
              <div className="form-footer">
                <p>New leads start in the New Lead stage.</p>
                <button
                  className="primary"
                  disabled={busy || assignees.length === 0}
                >
                  {busy ? "Saving..." : "Create lead"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
