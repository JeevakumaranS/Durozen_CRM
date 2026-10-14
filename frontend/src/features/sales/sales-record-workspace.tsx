"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiClient } from "../../lib/api-client";

type Kind = "proposals" | "negotiations";
type LeadOption = {
  id: string;
  customerName: string;
  stage: string;
  assignedBde: { fullName: string };
};
type SalesRecord = {
  id: string;
  lead?: { customerName: string; assignedBde?: { fullName: string } };
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
      { name: "validityUntil", label: "Valid until", type: "date" },
      { name: "sentAt", label: "Sent date", type: "datetime-local" },
      { name: "customerResponse", label: "Customer response" },
      {
        name: "followUpAt",
        label: "Follow-up date and time",
        type: "datetime-local",
        required: true,
      },
      { name: "nextAction", label: "Next action", required: true },
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
      { name: "competitorInformation", label: "Competitor information" },
      {
        name: "followUpAt",
        label: "Follow-up date and time",
        type: "datetime-local",
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
  "validityUntil",
  "sentAt",
]);
const text = (value: unknown) =>
  value === undefined || value === null || value === "" ? "—" : String(value);
const money = (value: unknown) =>
  value === undefined || value === null || value === ""
    ? "—"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
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
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

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
      setNotice("");
    } catch (error) {
      setRecords([]);
      setLeads([]);
      setNotice(
        error instanceof Error
          ? error.message
          : `Unable to load ${config.title.toLowerCase()}.`,
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
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const visibleRecords = records.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const body: Record<string, unknown> = { leadId: form.leadId };
    for (const field of config.fields) {
      const value = form[field.name] ?? field.options?.[0];
      if (!value) continue;
      body[field.name] = numericFields.has(field.name)
        ? Number(value)
        : dateFields.has(field.name)
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
      setNotice(`${config.title.slice(0, -1)} saved.`);
      await load();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : `Unable to save ${config.title.toLowerCase()}.`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveResponse(recordId: string) {
    setBusy(true);
    try {
      await apiClient<SalesRecord>(`/proposals/${recordId}`, {
        method: "PATCH",
        body: JSON.stringify({ customerResponse: responses[recordId] }),
      });
      setNotice("Proposal response updated.");
      await load();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Unable to update proposal response.",
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
            <span>Proposal</span>
            <strong>{text(record.proposalNumber)}</strong>
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
            <span>Sent</span>
            <strong>{date(record.sentAt ?? record.proposalDate)}</strong>
          </div>
          <div>
            <span>Follow-up</span>
            <strong>{date(record.followUpAt)}</strong>
          </div>
          <label className="record-response">
            Customer response
            <input
              value={
                responses[record.id] ??
                (record.customerResponse ? String(record.customerResponse) : "")
              }
              onChange={(event) =>
                setResponses({ ...responses, [record.id]: event.target.value })
              }
              placeholder="e.g. Reviewing quote"
            />
          </label>
          <button
            className="record-save"
            disabled={busy}
            onClick={() => void saveResponse(record.id)}
          >
            Save response
          </button>
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
          <span>Competitor</span>
          <strong>{text(record.competitorInformation)}</strong>
        </div>
        <div>
          <span>Next follow-up</span>
          <strong>{date(record.followUpAt)}</strong>
        </div>
        <div>
          <span>Next action</span>
          <strong>{text(record.nextAction)}</strong>
        </div>
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
          <Link className="secondary-action" href="/pipeline">
            Pipeline
          </Link>
          <button className="primary" onClick={() => setShowForm(true)}>
            + Add {config.title.slice(0, -1).toLowerCase()}
          </button>
        </div>
      </header>
      {notice && (
        <div className="workspace-notice" role="status">
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}
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
                  {text(record.proposalNumber)}
                </span>
              )}
            </div>
            <div className="sales-record-fields">{recordSummary(record)}</div>
          </article>
        ))}
        {!loading && !notice && records.length === 0 && (
          <div className="empty-list">
            No {config.title.toLowerCase()} recorded yet.
          </div>
        )}
      </div>
      {!loading && (
        <nav className="pagination" aria-label={`${config.title} pagination`}>
          <span>
            {records.length} {records.length === 1 ? config.title.slice(0, -1).toLowerCase() : config.title.toLowerCase()} ·
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
                      {lead.customerName} · {lead.stage.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              {config.fields.map((field) => (
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
                      required={field.required}
                      value={form[field.name] ?? ""}
                      onChange={(event) =>
                        setForm({ ...form, [field.name]: event.target.value })
                      }
                    />
                  )}
                </label>
              ))}
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
    </main>
  );
}
