"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiClient } from "../../lib/api-client";
import { notify } from "../../lib/notifications";
import { ClockDateTimePicker } from "../../components/shared/clock-date-time-picker";
import { LOST_REASONS } from "../leads/lost-reasons";

type Kind = "proposals" | "negotiations";
type LeadOption = {
  id: string;
  leadNumber: string;
  customerName: string;
  stage: string;
  assignedBde: { fullName: string };
};
type SalesRecord = {
  id: string;
  lead?: {
    leadNumber: string;
    customerName: string;
    businessName?: string | null;
    nextAction?: string | null;
    assignedBde?: { fullName: string };
  };
  [key: string]: unknown;
};
type Field = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: string[];
};

const configs: Record<
  Kind,
  { title: string; eyebrow: string; description: string; fields: Field[] }
> = {
  proposals: {
    title: "Proposals",
    eyebrow: "COMMERCIAL OFFERS",
    description:
      "Prepare quotes and keep customer responses attached to the opportunity.",
    fields: [
      { name: "serviceProduct", label: "Service / product", required: true },
      {
        name: "proposalAmount",
        label: "Proposal amount (₹)",
        type: "number",
        required: true,
      },
      { name: "discount", label: "Discount (₹)", type: "number" },
      { name: "tax", label: "Tax (₹)", type: "number" },
      { name: "customerResponse", label: "Customer response" },
      {
        name: "followUpAt",
        label: "Follow-up",
        type: "datetime",
        required: true,
      },
      {
        name: "nextAction",
        label: "Next action",
        required: true,
        options: ["Negotiation", "Won", "Lost"],
      },
      { name: "remarks", label: "Remarks" },
    ],
  },
  negotiations: {
    title: "Negotiations",
    eyebrow: "COMMERCIAL DISCUSSIONS",
    description:
      "Track customer expectations, agreed pricing, concerns, and the next conversation.",
    fields: [
      {
        name: "originalProposalAmount",
        label: "Original proposal (₹)",
        type: "number",
      },
      {
        name: "customerExpectedAmount",
        label: "Customer expected amount (₹)",
        type: "number",
      },
      {
        name: "negotiatedAmount",
        label: "Negotiated amount (₹)",
        type: "number",
      },
      { name: "customerConcern", label: "Customer concern" },
      {
        name: "followUpAt",
        label: "Follow-up",
        type: "datetime",
        required: true,
      },
      { name: "nextAction", label: "Next action", required: true },
      { name: "remarks", label: "Remarks" },
    ],
  },
};

const numericFields = new Set([
  "proposalAmount",
  "discount",
  "tax",
  "originalProposalAmount",
  "customerExpectedAmount",
  "negotiatedAmount",
]);
const dateFields = new Set([
  "followUpAt",
]);
const dateTimeFields = new Set(["followUpAt"]);
const proposalNextActions = ["Negotiation", "Won", "Lost"] as const;
const proposalNextActionFor = (value?: string | null) =>
  proposalNextActions.find((action) => action === value) ??
  proposalNextActions[0];
const text = (value: unknown) =>
  value === undefined || value === null || value === "" ? "—" : String(value);
const money = (value: unknown) =>
  value === undefined || value === null || value === ""
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
      }).format(Number(value));
const date = (value: unknown) =>
  value
    ? new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(String(value)))
    : "—";

export function SalesRecordWorkspace({ kind }: { kind: Kind }) {
  const config = configs[kind];
  const [records, setRecords] = useState<SalesRecord[]>([]);
  const [page, setPage] = useState(1);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [form, setForm] = useState<Record<string, string>>({ leadId: "" });
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [customerExpectedAmounts, setCustomerExpectedAmounts] = useState<
    Record<string, string>
  >({});
  const [nextActions, setNextActions] = useState<Record<string, string>>({});
  const [negotiationOutcomes, setNegotiationOutcomes] = useState<
    Record<string, string>
  >({});
  const [lostReasons, setLostReasons] = useState<Record<string, string>>({});
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [responseRecord, setResponseRecord] = useState<SalesRecord | null>(null);
  const [editingResponse, setEditingResponse] = useState(false);
  const [responseDraft, setResponseDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, leadRows] = await Promise.all([
        apiClient<SalesRecord[]>(`/${kind}`),
        apiClient<LeadOption[]>("/leads"),
      ]);
      setRecords(rows);
      setLeads(
        leadRows.filter((lead) => !["WON", "LOST"].includes(lead.stage)),
      );
    } catch (error) {
      setRecords([]);
      setLeads([]);
      notify(
        error instanceof Error
          ? error.message
          : `Unable to load ${config.title.toLowerCase()}.`,
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [config, kind]);

  useEffect(() => {
    setPage(1);
    void load();
  }, [load]);

  const pageSize = 10;
  const filteredRecords = searchQuery
    ? records.filter((record) => {
        const searchableValues =
          kind === "proposals"
            ? [
                record.lead?.customerName,
                record.lead?.leadNumber,
                record.lead?.businessName,
                record.lead?.assignedBde?.fullName,
                record.serviceProduct,
              ]
            : [
                record.lead?.customerName,
                record.lead?.businessName,
                record.lead?.assignedBde?.fullName,
                record.customerConcern,
                record.originalProposalAmount,
                record.customerExpectedAmount,
                record.negotiatedAmount,
              ];
        return searchableValues
          .filter((value) => value !== undefined && value !== null)
          .some((value) =>
            String(value).toLowerCase().includes(searchQuery.toLowerCase()),
          );
      })
    : records;
  const totalPages = Math.max(
    1,
    Math.ceil(filteredRecords.length / pageSize),
  );
  const visibleRecords = filteredRecords.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const missingDateTime = config.fields.find(
      (field) =>
        field.required &&
        dateTimeFields.has(field.name) &&
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(form[field.name] ?? ""),
    );
    if (missingDateTime) {
      notify(`Choose ${missingDateTime.label.toLowerCase()}.`, "error");
      return;
    }
    setBusy(true);
    const body: Record<string, unknown> = { leadId: form.leadId };
    for (const field of config.fields) {
      const value = form[field.name] ?? field.options?.[0];
      if (!value) continue;
      if (
        dateTimeFields.has(field.name) &&
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
      ) continue;
      body[field.name] = numericFields.has(field.name)
        ? Number(value)
        : dateTimeFields.has(field.name) || dateFields.has(field.name)
          ? new Date(value).toISOString()
          : value;
    }
    try {
      await apiClient<SalesRecord>(`/${kind}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setForm({ leadId: "" });
      setShowForm(false);
      notify(`${config.title.slice(0, -1)} saved.`);
      await load();
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : `Unable to save ${config.title.toLowerCase()}.`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveResponse(
    recordId: string,
    responseOverride?: string,
  ) {
    setBusy(true);
    try {
      const record = records.find((item) => item.id === recordId);
      const customerResponse = responseOverride ?? responses[recordId] ?? "";
      if (!customerResponse.trim()) {
        notify("Enter the customer response.", "error");
        return;
      }
      if (kind === "negotiations" && record?.responseSavedAt) {
        const updated = await apiClient<SalesRecord>(`/${kind}/${recordId}`, {
          method: "PATCH",
          body: JSON.stringify({ customerResponse: customerResponse.trim() }),
        });
        setResponseRecord({ ...record, ...updated });
        setResponseDraft(String(updated.customerResponse ?? customerResponse));
        setEditingResponse(false);
        notify("Negotiation response updated.");
        await load();
        return;
      }
      const nextAction =
        kind === "proposals"
          ? nextActions[recordId] ??
            proposalNextActionFor(record?.lead?.nextAction)
          : negotiationOutcomes[recordId] ?? "";
      const lostReason = lostReasons[recordId] ?? LOST_REASONS[0];
      const customerExpectedAmount = customerExpectedAmounts[recordId] ?? "";
      if (!nextAction) {
        notify("Choose an outcome.", "error");
        return;
      }
      if (nextAction === "Lost" && !lostReason.trim()) {
        notify("Choose a lost reason.", "error");
        return;
      }
      if (
        kind === "proposals" &&
        nextAction === "Negotiation" &&
        (!customerExpectedAmount || Number(customerExpectedAmount) < 0)
      ) {
        notify("Enter the customer's expected amount.", "error");
        return;
      }
      await apiClient<SalesRecord>(`/${kind}/${recordId}`, {
        method: "PATCH",
        body: JSON.stringify({
          customerResponse: customerResponse.trim(),
          ...(kind === "proposals" && nextAction === "Negotiation"
            ? { customerExpectedAmount: Number(customerExpectedAmount) }
            : {}),
          lostReason: nextAction === "Lost" ? lostReason : undefined,
          nextAction,
        }),
      });
      notify(`${config.title.slice(0, -1)} updated. Lead moved to ${nextAction}.`);
      setResponses({ ...responses, [recordId]: customerResponse.trim() });
      await load();
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : `Unable to update ${config.title.toLowerCase()} outcome.`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  function recordSummary(record: SalesRecord) {
    if (kind === "proposals")
      return (
        <>
          <div>
            <span>Lead Number</span>
            <strong>{text(record.lead?.leadNumber)}</strong>
          </div>
          <div>
            <span>Service</span>
            <strong>{text(record.serviceProduct)}</strong>
          </div>
          <div>
            <span>Amount</span>
            <strong>{money(record.finalAmount)}</strong>
          </div>
          <div>
            <span>Proposal Date</span>
            <strong>{date(record.proposalDate)}</strong>
          </div>
          <div>
            <span>Follow-up</span>
            <strong>{date(record.followUpAt)}</strong>
          </div>
          {record.responseSavedAt ? (
            <>
              <div>
                <span>Outcome</span>
                <strong>{text(record.lead?.nextAction)}</strong>
              </div>
              <div>
                <span>Customer response</span>
                <strong>{text(record.customerResponse)}</strong>
              </div>
            </>
          ) : (
            <>
              <label className="record-response">
                Next action
                <select
                  value={
                    nextActions[record.id] ??
                    proposalNextActionFor(record.lead?.nextAction)
                  }
                  onChange={(event) =>
                    setNextActions({
                      ...nextActions,
                      [record.id]: event.target.value,
                    })
                  }
                >
                  {proposalNextActions.map((action) => (
                    <option key={action} value={action}>
                      {action}
                    </option>
                  ))}
                </select>
              </label>
              <label className="record-response">
                Customer response *
                <input
                  required
                  value={
                    responses[record.id] ??
                    (record.customerResponse
                      ? String(record.customerResponse)
                      : "")
                  }
                  onChange={(event) =>
                    setResponses({
                      ...responses,
                      [record.id]: event.target.value,
                    })
                  }
                  placeholder="e.g. Reviewing quote"
                />
              </label>
              {(
                nextActions[record.id] ??
                proposalNextActionFor(record.lead?.nextAction)
              ) === "Lost" && (
                <label className="record-response">
                  Lost reason *
                  <select
                    required
                    value={lostReasons[record.id] ?? LOST_REASONS[0]}
                    onChange={(event) =>
                      setLostReasons({
                        ...lostReasons,
                        [record.id]: event.target.value,
                      })
                    }
                  >
                    {LOST_REASONS.map((reason) => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(
                nextActions[record.id] ??
                proposalNextActionFor(record.lead?.nextAction)
              ) === "Negotiation" && (
                <label className="record-response">
                  Customer expected amount (₹) *
                  <input
                    required
                    min="0"
                    step="0.01"
                    type="number"
                    value={customerExpectedAmounts[record.id] ?? ""}
                    onChange={(event) =>
                      setCustomerExpectedAmounts({
                        ...customerExpectedAmounts,
                        [record.id]: event.target.value,
                      })
                    }
                  />
                </label>
              )}
              <button
                className="record-save"
                disabled={busy}
                onClick={() => void saveResponse(record.id)}
              >
                Save outcome
              </button>
            </>
          )}
        </>
      );
    return (
      <>
        <div>
          <span>Proposal amount</span>
          <strong>{money(record.originalProposalAmount)}</strong>
        </div>
        <div>
          <span>Customer expects</span>
          <strong>{money(record.customerExpectedAmount)}</strong>
        </div>
        <div>
          <span>Negotiated</span>
          <strong>{money(record.negotiatedAmount)}</strong>
        </div>
        <div>
          <span>Concern</span>
          <strong>{text(record.customerConcern)}</strong>
        </div>
        <div>
          <span>Next follow-up</span>
          <strong>{date(record.followUpAt)}</strong>
        </div>
        <div>
          <span>Next action</span>
          <strong>{text(record.nextAction)}</strong>
        </div>
        {record.responseSavedAt ? (
          <>
            <div>
              <span>Outcome</span>
              <strong>{text(record.nextAction)}</strong>
            </div>
            <button
              className="record-save"
              type="button"
              onClick={() => {
                setResponseRecord(record);
                setResponseDraft(String(record.customerResponse ?? ""));
                setEditingResponse(false);
              }}
            >
              View response
            </button>
          </>
        ) : (
          <>
            <label className="record-response">
              Outcome *
              <select
                required
                value={negotiationOutcomes[record.id] ?? ""}
                onChange={(event) =>
                  setNegotiationOutcomes({
                    ...negotiationOutcomes,
                    [record.id]: event.target.value,
                  })
                }
              >
                <option value="">Choose an outcome</option>
                <option value="Won">Won</option>
                <option value="Lost">Lost</option>
              </select>
            </label>
            <label className="record-response">
              Customer response *
              <input
                required
                value={
                  responses[record.id] ??
                  (record.customerResponse
                    ? String(record.customerResponse)
                    : "")
                }
                onChange={(event) =>
                  setResponses({ ...responses, [record.id]: event.target.value })
                }
                placeholder="Summarize the customer's decision"
              />
            </label>
            {(negotiationOutcomes[record.id] ?? "") === "Lost" && (
              <label className="record-response">
                Lost reason *
                <select
                  required
                  value={lostReasons[record.id] ?? LOST_REASONS[0]}
                  onChange={(event) =>
                    setLostReasons({
                      ...lostReasons,
                      [record.id]: event.target.value,
                    })
                  }
                >
                  {LOST_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              className="record-save"
              disabled={busy}
              onClick={() => void saveResponse(record.id)}
            >
              Save outcome
            </button>
          </>
        )}
      </>
    );
  }

  return (
    <main className="lead-workspace sales-record-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">{config.eyebrow}</p>
          <h1>{config.title}</h1>
          <p className="subtitle">{config.description}</p>
        </div>
        <div className="workspace-actions">
          <Link className="secondary-action" href="/leads">
            Leads
          </Link>
          <button className="primary" onClick={() => setShowForm(true)}>
            + Add {config.title.slice(0, -1).toLowerCase()}
          </button>
        </div>
      </header>
      <form
        className="sales-record-search"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSearchQuery(searchInput.trim());
        }}
      >
        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label={`Search ${config.title.toLowerCase()}`}
            placeholder={
              kind === "proposals"
                ? "Search customer, business, proposal, or service"
                : "Search customer, business, amounts, concern, or competitor"
            }
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </label>
        <button className="secondary-action" type="submit">
          Search
        </button>
      </form>
      <div className="sales-record-list">
        {loading && (
          <p className="dashboard-loading">
            Loading {config.title.toLowerCase()}...
          </p>
        )}
        {visibleRecords.map((record) => (
          <article className="sales-record" key={record.id}>
            <div className="sales-record-heading">
              <div>
                <Link href={`/leads/${String(record.leadId)}`}>
                  {text(record.lead?.customerName)}
                </Link>
                <span>
                  {record.lead?.assignedBde?.fullName ?? "Assigned BDE"}
                </span>
              </div>
              {kind === "proposals" && (
                <span className="record-number">
                  {text(record.lead?.leadNumber)}
                </span>
              )}
            </div>
            <div className="sales-record-fields">{recordSummary(record)}</div>
          </article>
        ))}
        {!loading && filteredRecords.length === 0 && (
          <div className="empty-list">
            {filteredRecords.length === 0 && records.length === 0
              ? `No ${config.title.toLowerCase()} recorded yet.`
              : `No ${config.title.toLowerCase()} match your search.`}
          </div>
        )}
      </div>
      {!loading && (
        <nav className="pagination" aria-label={`${config.title} pagination`}>
          <span>
            {filteredRecords.length} {filteredRecords.length === 1 ? config.title.slice(0, -1).toLowerCase() : config.title.toLowerCase()} ·
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
            aria-labelledby="record-form-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{config.eyebrow}</p>
                <h2 id="record-form-title">
                  Add {config.title.slice(0, -1).toLowerCase()}
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
            <form
              className="lead-form sales-record-form"
              onSubmit={createRecord}
            >
              <label className="form-wide">
                Lead *
                <select
                  required
                  value={form.leadId ?? ""}
                  onChange={(event) =>
                    setForm({ ...form, leadId: event.target.value })
                  }
                >
                  <option value="">Select an active lead</option>
                  {leads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.leadNumber} · {lead.customerName} ·{" "}
                      {lead.stage.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              {config.fields.map((field) =>
                field.type === "datetime" ? (
                  <ClockDateTimePicker
                    key={field.name}
                    className="form-wide"
                    label={field.label}
                    required={field.required}
                    value={form[field.name] ?? ""}
                    onChange={(value) =>
                      setForm({ ...form, [field.name]: value })
                    }
                  />
                ) : (
                  <label
                    className={field.type === "textarea" ? "form-wide" : ""}
                    key={field.name}
                  >
                    {field.label}
                    {field.options ? (
                      <select
                        required={field.required}
                        value={form[field.name] ?? field.options[0]}
                        onChange={(event) =>
                          setForm({ ...form, [field.name]: event.target.value })
                        }
                      >
                        {field.options.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    ) : field.type === "textarea" ? (
                      <textarea
                        rows={2}
                        required={field.required}
                        value={form[field.name] ?? ""}
                        onChange={(event) =>
                          setForm({ ...form, [field.name]: event.target.value })
                        }
                      />
                    ) : (
                      <input
                        type={field.type ?? "text"}
                        min={field.type === "number" ? 0 : undefined}
                        step={field.type === "number" ? "0.01" : undefined}
                        required={field.required}
                        value={form[field.name] ?? ""}
                        onChange={(event) =>
                          setForm({ ...form, [field.name]: event.target.value })
                        }
                      />
                    )}
                  </label>
                ),
              )}
              <div className="form-footer">
                <p>
                  Saving this record updates the lead stage and activity
                  timeline.
                </p>
                <button
                  className="primary"
                  disabled={busy || leads.length === 0}
                >
                  {busy ? "Saving..." : "Save record"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {kind === "negotiations" && responseRecord && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setResponseRecord(null);
              setEditingResponse(false);
            }
          }}
        >
          <section
            className="lead-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="negotiation-response-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">NEGOTIATION OUTCOME</p>
                <h2 id="negotiation-response-title">
                  {editingResponse
                    ? "Edit customer response"
                    : "Customer response"}
                </h2>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label="Close"
                onClick={() => {
                  setResponseRecord(null);
                  setEditingResponse(false);
                }}
              >
                ×
              </button>
            </div>
            {editingResponse ? (
              <form
                className="lead-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveResponse(responseRecord.id, responseDraft);
                }}
              >
                <label className="form-wide">
                  Customer response *
                  <textarea
                    required
                    rows={4}
                    value={responseDraft}
                    onChange={(event) => setResponseDraft(event.target.value)}
                  />
                </label>
                <div className="form-footer">
                  <p>Outcome: {text(responseRecord.nextAction)}</p>
                  <div>
                    <button
                      className="secondary-action"
                      type="button"
                      disabled={busy}
                      onClick={() => setEditingResponse(false)}
                    >
                      Cancel
                    </button>
                    <button className="primary" disabled={busy}>
                      {busy ? "Saving..." : "Save changes"}
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <div className="lead-form">
                <label className="form-wide">
                  Outcome
                  <input readOnly value={String(responseRecord.nextAction ?? "")} />
                </label>
                <label className="form-wide">
                  Customer response
                  <textarea readOnly rows={4} value={responseDraft} />
                </label>
                <div className="form-footer">
                  <p>Saved negotiation response</p>
                  <div>
                    <button
                      className="secondary-action"
                      type="button"
                      onClick={() => setResponseRecord(null)}
                    >
                      Close
                    </button>
                    <button
                      className="primary"
                      type="button"
                      onClick={() => setEditingResponse(true)}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
