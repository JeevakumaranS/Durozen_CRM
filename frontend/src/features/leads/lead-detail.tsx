"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiClient, getApiUrl } from "../../lib/api-client";
import { getAccessToken } from "../../lib/auth";
import { LEAD_UPDATED_EVENT } from "../../lib/lead-events";
import { notify } from "../../lib/notifications";
import { formatBusinessDateTime, formatEmbeddedDateTimes } from "../../lib/business-time";

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
  paymentAmount?: string | number | null;
  paymentStatus?: string | null;
  paymentTotal?: string | number | null;
  paymentBalance?: string | number | null;
  remarks?: string | null;
  followUpAt?: string | null;
  createdAt: string;
  user?: { fullName: string } | null;
  meeting?: {
    meetingAt: string;
    type: string;
    requirement?: string | null;
    budget?: string | number | null;
    discussionNotes?: string | null;
    nextAction: string;
    followUpAt: string;
  } | null;
};
type LeadDetails = {
  id: string;
  leadNumber: string;
  leadDate: string;
  customerName: string;
  businessName?: string | null;
  mobileNumber: string;
  email?: string | null;
  location?: string | null;
  requirement?: string | null;
  estimatedBudget?: string | number | null;
  finalDealValue?: string | number | null;
  wonService?: string | null;
  paymentStatus?: string | null;
  advanceAmount?: string | number | null;
  paidAmount?: string | number | null;
  confirmedAt?: string | null;
  leadSource: string;
  priority: string;
  stage: string;
  nextAction?: string | null;
  followUpAt?: string | null;
  remarks?: string | null;
  stageEnteredAt: string;
  assignedBde: { fullName: string };
  activities: Activity[];
  proposals?: {
    proposalDate: string;
    serviceProduct: string;
    proposalAmount: string | number;
    discount: string | number;
    tax: string | number;
    finalAmount: string | number;
    customerResponse?: string | null;
    followUpAt?: string | null;
    remarks?: string | null;
    createdAt: string;
  }[];
  negotiations?: {
    expectedTimeline?: string | null;
    customerConcern?: string | null;
  }[];
};

const dateTime = formatBusinessDateTime;
const currency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
const leadDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
const proposalActivityDetails = (description: string) =>
  description
    .split(/\r?\n/)
    .map((line, index) => {
      const separator = line.indexOf(": ");
      return separator < 0
        ? index === 0
          ? { label: "Description", value: line }
          : null
        : {
            label: line.slice(0, separator),
            value: line.slice(separator + 2),
          };
    })
    .filter((detail): detail is { label: string; value: string } =>
      Boolean(detail?.value),
    );
const proposalDetailsFromRecord = (
  proposal: NonNullable<LeadDetails["proposals"]>[number],
) => [
  { label: "Product / service", value: proposal.serviceProduct },
  { label: "Proposal date", value: leadDate(proposal.proposalDate) },
  {
    label: "Proposal amount",
    value: currency(Number(proposal.proposalAmount)),
  },
  { label: "Discount", value: currency(Number(proposal.discount)) },
  { label: "Tax", value: currency(Number(proposal.tax)) },
  { label: "Final amount", value: currency(Number(proposal.finalAmount)) },
  ...(proposal.customerResponse
    ? [{ label: "Customer response", value: proposal.customerResponse }]
    : []),
  ...(proposal.followUpAt
    ? [{ label: "Follow-up", value: dateTime(proposal.followUpAt) }]
    : []),
  ...(proposal.remarks
    ? [{ label: "Remarks", value: proposal.remarks }]
    : []),
];

export function LeadDetail({
  showActivityExport = false,
  backHref = "/leads",
  backLabel = "All leads",
}: {
  showActivityExport?: boolean;
  backHref?: string;
  backLabel?: string;
}) {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [lead, setLead] = useState<LeadDetails | null>(null);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(
    null,
  );
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [exportingActivities, setExportingActivities] = useState<
    "pdf" | "xlsx" | null
  >(null);
  const timelineActivities = lead?.activities ?? [];
  const finalDealValue =
    Math.round(Number(lead?.finalDealValue ?? 0) * 100) / 100;
  const paidAmount =
    Math.round(
      Number(
        lead?.paidAmount ??
          (lead?.paymentStatus === "Fully Paid"
            ? finalDealValue
            : lead?.advanceAmount ?? 0),
      ) * 100,
    ) / 100;
  const remainingBalance =
    Math.max(0, Math.round((finalDealValue - paidAmount) * 100) / 100);
  const paymentAmountNumber = Number(paymentAmount);
  const paymentPreviewStatus =
    paymentAmountNumber <= 0 || paymentAmountNumber > remainingBalance
      ? ""
      : paymentAmountNumber >= remainingBalance
        ? "Fully Paid"
        : paidAmount === 0
          ? "Advance Payment"
          : "Partial Payment";

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

  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !Number.isFinite(paymentAmountNumber) ||
      paymentAmountNumber <= 0 ||
      paymentAmountNumber > remainingBalance
    ) {
      notify("Enter a payment amount no greater than the remaining balance.", "error");
      return;
    }
    setSavingPayment(true);
    try {
      await apiClient(`/leads/${id}/payments`, {
        method: "POST",
        body: JSON.stringify({ amount: paymentAmountNumber }),
      });
      setPaymentAmount("");
      setShowPaymentForm(false);
      notify("Payment logged to the activity timeline.");
      await load();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to log payment.",
        "error",
      );
    } finally {
      setSavingPayment(false);
    }
  }

  async function exportActivities(format: "pdf" | "xlsx") {
    if (!lead) return;
    setExportingActivities(format);
    try {
      const token = getAccessToken();
      const response = await fetch(
        `${getApiUrl()}/exports/lead-activities/${encodeURIComponent(id)}?format=${format}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      if (!response.ok) {
        const responseText = await response.text();
        let message = responseText;
        try {
          const body: unknown = JSON.parse(responseText);
          if (body && typeof body === "object" && "message" in body) {
            const detail = body.message;
            message = Array.isArray(detail)
              ? detail.join(", ")
              : String(detail);
          }
        } catch {
          message = responseText;
        }
        throw new Error(message || "Unable to export lead activity.");
      }
      const file = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = file;
      anchor.download = `${lead.leadNumber}-activity.${format}`;
      anchor.click();
      URL.revokeObjectURL(file);
    } catch (reason) {
      notify(
        reason instanceof Error
          ? reason.message
          : "Unable to export lead activity.",
        "error",
      );
    } finally {
      setExportingActivities(null);
    }
  }

  useEffect(() => {
    const refreshLead = (event: Event) => {
      const { leadId } = (event as CustomEvent<{ leadId: string }>).detail;
      if (leadId === id) void load();
    };
    window.addEventListener(LEAD_UPDATED_EVENT, refreshLead);
    return () => window.removeEventListener(LEAD_UPDATED_EVENT, refreshLead);
  }, [id, load]);

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
        <Link className="detail-back" href={backHref}>
          ← {backLabel}
        </Link>
        <p>Loading lead...</p>
      </main>
    );

  return (
    <main className="lead-workspace">
      <Link className="detail-back" href={backHref}>
        ← {backLabel}
      </Link>
      <header className="detail-header">
        <div>
          <p className="eyebrow">{lead.leadNumber}</p>
          <h1>{lead.customerName}</h1>
          <p className="subtitle">
            {lead.businessName || "Prospective customer"}{" "}
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
              <h2>{lead.stage === "WON" ? "Deal summary" : "Next action"}</h2>
              <p>
                {lead.stage === "WON"
                  ? "Customer requirement and expected timeline."
                  : "Every active opportunity needs a dated next step."}
              </p>
            </div>
          </div>
          {lead.stage === "WON" ? (
            <dl className="next-action-box">
              <div>
                <dt>Customer requirement</dt>
                <dd>
                  {lead.requirement ||
                    lead.negotiations?.[0]?.customerConcern ||
                    "—"}
                </dd>
              </div>
              <div>
                <dt>Expected timeline</dt>
                <dd>{lead.negotiations?.[0]?.expectedTimeline || "—"}</dd>
              </div>
            </dl>
          ) : (
            <div className="next-action-box">
              <strong>{lead.nextAction || "No next action set"}</strong>
              <span>
                {lead.followUpAt
                  ? `Due ${dateTime(lead.followUpAt)}`
                  : "No follow-up scheduled"}
              </span>
            </div>
          )}
          <div className="detail-section-heading timeline-heading">
            <div className="timeline-heading-copy">
              <h2>Activity timeline</h2>
              <p>
                {lead.stage === "WON"
                  ? `Paid ${currency(paidAmount)} of ${currency(finalDealValue)}; balance ${currency(remainingBalance)}.`
                  : "Customer interactions and updates, newest first."}
              </p>
            </div>
            <div className="timeline-heading-actions">
              {showActivityExport && (
                <>
                  <button
                    className="secondary-action"
                    disabled={exportingActivities !== null}
                    onClick={() => void exportActivities("pdf")}
                    type="button"
                  >
                    {exportingActivities === "pdf"
                      ? "Exporting..."
                      : "Export PDF"}
                  </button>
                  <button
                    className="secondary-action"
                    disabled={exportingActivities !== null}
                    onClick={() => void exportActivities("xlsx")}
                    type="button"
                  >
                    {exportingActivities === "xlsx"
                      ? "Exporting..."
                      : "Export Excel"}
                  </button>
                </>
              )}
              {lead.stage === "WON" && remainingBalance > 0 && (
                <button
                  className="primary"
                  type="button"
                  onClick={() => {
                    setPaymentAmount("");
                    setShowPaymentForm(true);
                  }}
                >
                  Log payment
                </button>
              )}
            </div>
          </div>
          <div className="activity-timeline">
            {timelineActivities.map((activity) => {
              const isMeetingCompletion = activity.type === "MEETING_COMPLETED";
              const isProposalSent = activity.type === "PROPOSAL_SENT";
              const proposalRecord = isProposalSent
                ? lead.proposals
                    ?.filter((proposal) =>
                      activity.description.includes(proposal.serviceProduct),
                    )
                    .sort(
                      (first, second) =>
                        Math.abs(
                          new Date(first.createdAt).getTime() -
                            new Date(activity.createdAt).getTime(),
                        ) -
                        Math.abs(
                          new Date(second.createdAt).getTime() -
                            new Date(activity.createdAt).getTime(),
                        ),
                    )[0]
                : undefined;
              const proposalDetails = isProposalSent
                ? proposalActivityDetails(activity.description)
                : [];
              const hasProposalInputs =
                proposalDetails.some(
                  ({ label }) => label === "Proposal amount",
                );
              const displayedProposalDetails =
                proposalRecord && !hasProposalInputs
                  ? proposalDetailsFromRecord(proposalRecord)
                  : proposalDetails;
              const contactDate =
                activity.contactDate ??
                (isMeetingCompletion ? activity.meeting?.meetingAt : null);
              const contactType =
                activity.contactType ??
                (isMeetingCompletion ? activity.meeting?.type : null);
              const requirement =
                activity.requirement ??
                (isMeetingCompletion ? activity.meeting?.requirement : null);
              const budget =
                activity.estimatedBudget ??
                (isMeetingCompletion ? activity.meeting?.budget : null);
              const remarks =
                activity.remarks ??
                (isMeetingCompletion
                  ? activity.meeting?.discussionNotes
                  : null);
              const nextAction =
                activity.nextAction ??
                (isMeetingCompletion ? activity.meeting?.nextAction : null);
              const followUpAt =
                activity.followUpAt ??
                (isMeetingCompletion ? activity.meeting?.followUpAt : null);

              return (
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
                      {isProposalSent ? (
                        displayedProposalDetails.map(({ label, value }) => (
                          <div key={label}>
                            <dt>{label}</dt>
                            <dd>{formatEmbeddedDateTimes(value)}</dd>
                          </div>
                        ))
                      ) : (
                        <div>
                          <dt>Description</dt>
                          <dd>{formatEmbeddedDateTimes(activity.description)}</dd>
                        </div>
                      )}
                      {activity.outcome && (
                        <div>
                          <dt>Outcome</dt>
                          <dd>{activity.outcome}</dd>
                        </div>
                      )}
                      {!isProposalSent && contactDate && (
                        <div>
                          <dt>
                            {isMeetingCompletion
                              ? "Meeting date"
                              : isProposalSent
                                ? "Proposal date"
                                : "Contact date"}
                          </dt>
                          <dd>{leadDate(contactDate)}</dd>
                        </div>
                      )}
                      {!isProposalSent && contactType && (
                        <div>
                          <dt>
                            {isMeetingCompletion
                              ? "Meeting type"
                              : isProposalSent
                                ? "Activity type"
                                : "Contact type"}
                          </dt>
                          <dd>{contactType}</dd>
                        </div>
                      )}
                      {activity.customerResponse && (
                        <div>
                          <dt>Customer response</dt>
                          <dd>{activity.customerResponse}</dd>
                        </div>
                      )}
                      {requirement && (
                        <div>
                          <dt>Requirement</dt>
                          <dd>{requirement}</dd>
                        </div>
                      )}
                      {budget !== null && budget !== undefined && (
                        <div>
                          <dt>
                            {isMeetingCompletion
                              ? "Meeting budget"
                              : "Estimated budget"}
                          </dt>
                          <dd>{currency(Number(budget))}</dd>
                        </div>
                      )}
                      {activity.paymentAmount !== null &&
                        activity.paymentAmount !== undefined && (
                          <>
                            <div>
                              <dt>Payment received</dt>
                              <dd>
                                {currency(Number(activity.paymentAmount))}
                              </dd>
                            </div>
                            {activity.paymentStatus && (
                              <div>
                                <dt>Payment status</dt>
                                <dd>{activity.paymentStatus}</dd>
                              </div>
                            )}
                            {activity.paymentTotal !== null &&
                              activity.paymentTotal !== undefined && (
                                <div>
                                  <dt>Total paid</dt>
                                  <dd>
                                    {currency(Number(activity.paymentTotal))}
                                  </dd>
                                </div>
                              )}
                            {activity.paymentBalance !== null &&
                              activity.paymentBalance !== undefined && (
                                <div>
                                  <dt>Remaining balance</dt>
                                  <dd>
                                    {currency(Number(activity.paymentBalance))}
                                  </dd>
                                </div>
                              )}
                          </>
                        )}
                      {activity.expectedTimeline && (
                        <div>
                          <dt>Expected timeline</dt>
                          <dd>{activity.expectedTimeline}</dd>
                        </div>
                      )}
                      {remarks && (
                        <div>
                          <dt>Remarks</dt>
                          <dd>{remarks}</dd>
                        </div>
                      )}
                      {nextAction && (
                        <div>
                          <dt>Next action</dt>
                          <dd>{nextAction}</dd>
                        </div>
                      )}
                      {followUpAt && (
                        <div>
                          <dt>Follow-up</dt>
                          <dd>{dateTime(followUpAt)}</dd>
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
              );
            })}
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
                    ? currency(Number(lead.estimatedBudget))
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
                        ? currency(Number(lead.finalDealValue))
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
                        : currency(Number(lead.advanceAmount))}
                    </dd>
                  </div>
                  <div>
                    <dt>Confirmed date</dt>
                    <dd>
                      {lead.confirmedAt ? dateTime(lead.confirmedAt) : "—"}
                    </dd>
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
        </aside>
      </div>
      {showPaymentForm && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowPaymentForm(false);
          }}
        >
          <section
            className="lead-modal payment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="log-payment-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">WON DEAL PAYMENT</p>
                <h2 id="log-payment-title">Log payment</h2>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label="Close"
                onClick={() => setShowPaymentForm(false)}
              >
                ×
              </button>
            </div>
            <form className="lead-form payment-form" onSubmit={recordPayment}>
              <dl className="form-wide payment-balance-summary">
                <div>
                  <dt>Final deal value</dt>
                  <dd>{currency(finalDealValue)}</dd>
                </div>
                <div>
                  <dt>Already paid</dt>
                  <dd>{currency(paidAmount)}</dd>
                </div>
                <div>
                  <dt>Remaining balance</dt>
                  <dd>{currency(remainingBalance)}</dd>
                </div>
              </dl>
              <label className="form-wide">
                Payment received
                <span className="payment-input">
                  <span>₹</span>
                  <input
                    autoFocus
                    required
                    min="0.01"
                    max={remainingBalance}
                    step="0.01"
                    type="number"
                    value={paymentAmount}
                    onChange={(event) => setPaymentAmount(event.target.value)}
                    placeholder="Enter amount"
                  />
                </span>
              </label>
              <div className="form-wide payment-status-preview">
                <span>Payment status after this entry</span>
                <strong
                  className={
                    paymentPreviewStatus === "Fully Paid" ? "is-fully-paid" : ""
                  }
                >
                  {paymentPreviewStatus ||
                    "Enter an amount within the remaining balance"}
                </strong>
              </div>
              <div className="form-footer">
                <p>
                  Payment status and balance are calculated from the final deal
                  value.
                </p>
                <div>
                  <button
                    className="secondary-action"
                    disabled={savingPayment}
                    type="button"
                    onClick={() => setShowPaymentForm(false)}
                  >
                    Cancel
                  </button>
                  <button className="primary" disabled={savingPayment}>
                    {savingPayment ? "Saving..." : "Save payment"}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
