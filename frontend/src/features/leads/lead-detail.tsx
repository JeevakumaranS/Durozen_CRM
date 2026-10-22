"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "../../lib/api-client";
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

export function LeadDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [lead, setLead] = useState<LeadDetails | null>(null);
  const [expandedActivityId, setExpandedActivityId] = useState<string | null>(
    null,
  );
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
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
                            <dd>{currency(Number(activity.estimatedBudget))}</dd>
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
