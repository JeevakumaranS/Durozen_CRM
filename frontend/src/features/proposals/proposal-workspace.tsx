"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "../../lib/api-client";
import { notify } from "../../lib/notifications";
import { notifyLeadUpdated } from "../../lib/lead-events";
import { ClockDateTimePicker } from "../../components/shared/clock-date-time-picker";
import {
  MobileFilterContent,
  MobileFilterToggle,
} from "../../components/shared/mobile-filter-disclosure";
import { LOST_REASONS } from "../leads/lost-reasons";
import { ProposalCompletionFields } from "./proposal-completion-fields";
import {
  BUSINESS_TIME_ZONE,
  businessDateKey,
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
type Assignee = { id: string; fullName: string };
type FollowUp = {
  id: string;
  dueAt: string;
  type: string;
  nextAction: string;
  remarks?: string | null;
  status: "PENDING" | "COMPLETED" | "RESCHEDULED" | "CANCELLED";
  proposal?: {
    id: string;
    customerResponse?: string | null;
    responseSavedAt?: string | null;
  } | null;
  lead: {
    id: string;
    customerName: string;
    businessName?: string | null;
    mobileNumber: string;
    stage: string;
    assignedBde: { id: string; fullName: string };
    activities?: {
      contactType: string | null;
      customerResponse?: string | null;
    }[];
    negotiations?: {
      id: string;
      customerResponse?: string | null;
      responseSavedAt?: string | null;
      nextAction?: string | null;
    }[];
  };
};
type FollowUpStatus = FollowUp["status"];
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
const WON_PAYMENT_STATUSES = [
  "Advance Payment",
  "Fully Paid",
  "Not Paid",
] as const;
const PROPOSAL_TYPES = ["Proposal Follow-up"];
const NEGOTIATION_TYPES = ["Negotiation"];
const CONTACT_TYPES = [
  "Phone Call",
  "WhatsApp",
  "Email",
  "Direct Meeting",
  "Other",
] as const;
const businessInputValue = businessDateTimeInputValue;
const businessDateTimeIso = businessDateTimeToIso;
const formatDate = formatBusinessDateTime;
const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
export function ProposalWorkspace() {
  const isNegotiation = false;
  const itemLabel = isNegotiation ? "negotiation" : "proposal";
  const itemPlural = isNegotiation ? "negotiations" : "proposals";
  const itemTitle = isNegotiation ? "Negotiation" : "Proposal";
  const workspaceTitle = isNegotiation ? "Negotiations" : "Proposals";
  const types = isNegotiation ? NEGOTIATION_TYPES : PROPOSAL_TYPES;
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<FollowUp[]>([]);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
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
  const [pendingResponseOnly, setPendingResponseOnly] = useState(false);
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
  const [type, setType] = useState(
    isNegotiation ? "Negotiation" : "Proposal Follow-up",
  );
  const [nextAction, setNextAction] = useState("");
  const [remarks, setRemarks] = useState("");
  const [editing, setEditing] = useState<{
    id: string;
    status: FollowUp["status"];
  } | null>(null);
  const [responseItem, setResponseItem] = useState<FollowUp | null>(null);
  const [responseMode, setResponseMode] = useState<"new" | "view" | "edit">(
    "new",
  );
  const [proposalResponse, setProposalResponse] = useState("");
  const [proposalNextAction, setProposalNextAction] = useState<
    "" | "Negotiation" | "Won" | "Lost"
  >("Negotiation");
  const [customerExpectedAmount, setCustomerExpectedAmount] = useState("");
  const [proposalLostReason, setProposalLostReason] = useState(LOST_REASONS[0]);
  const [expectedTimeline, setExpectedTimeline] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<
    "" | (typeof WON_PAYMENT_STATUSES)[number]
  >("");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [nextDueAt, setNextDueAt] = useState("");
  const [proposalFollowUpDate, setProposalFollowUpDate] = useState(
    businessDateKey(new Date(Date.now() + 86400000)),
  );
  const [nextActionText, setNextActionText] = useState("");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [serviceProduct, setServiceProduct] = useState("");
  const [proposalAmount, setProposalAmount] = useState("");
  const [discount, setDiscount] = useState("");
  const [contactDate, setContactDate] = useState(businessDateKey(new Date()));
  const [contactType, setContactType] =
    useState<(typeof CONTACT_TYPES)[number]>("Phone Call");
  const [customerResponse, setCustomerResponse] = useState("");
  const [requirement, setRequirement] = useState("");
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
    params.set(
      "type",
      isNegotiation
        ? "Negotiation"
        : enabledFilters.type && typeFilters.length
          ? typeFilters.join(",")
          : "Proposal Follow-up",
    );
    if (enabledFilters.assignee && assignedBdeIds.length)
      params.set("assignedBdeId", assignedBdeIds.join(","));
    if (statusFilters.length) params.set("status", statusFilters.join(","));
    if (!isNegotiation && pendingResponseOnly)
      params.set("pendingResponse", "true");
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
            : `Unable to load ${itemPlural}.`;
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
    itemPlural,
    isNegotiation,
    pendingResponseOnly,
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
          leadRows.filter(
            (lead) =>
              !["WON", "LOST"].includes(lead.stage) &&
              (!isNegotiation || lead.stage === "NEGOTIATION"),
          ),
        );
        setAssignees(authorizedAssignees);
      })
      .catch((reason: unknown) => {
        notify(
          reason instanceof Error
            ? reason.message
            : `Unable to load ${itemLabel} options.`,
          "error",
        );
      });
  }, [isNegotiation, itemLabel]);

  const pageSize = 10;
  const orderedItems = [...items].sort(
    (first, second) =>
      Number(first.status !== "PENDING") -
        Number(second.status !== "PENDING") ||
      new Date(first.dueAt).getTime() - new Date(second.dueAt).getTime(),
  );
  const totalPages = Math.max(1, Math.ceil(orderedItems.length / pageSize));
  const visibleItems = orderedItems.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

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
      setType(isNegotiation ? "Negotiation" : "Proposal Follow-up");
      setNextAction("");
      setRemarks("");
      notify(`${itemTitle} scheduled.`);
      setPage(1);
      await load();
    } catch (reason) {
      notify(
        reason instanceof Error
          ? reason.message
          : `Unable to schedule ${itemLabel}.`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateFollowUp(item: FollowUp) {
    if (!editing) return;
    const completing = editing.status === "COMPLETED";
    if (completing) {
      const negotiationCompletion =
        isNegotiation || item.type === "Negotiation";
      if (
        negotiationCompletion
          ? !contactDate ||
            !contactType ||
            !customerResponse.trim() ||
            !requirement.trim() ||
            !nextDueAt ||
            !nextActionText.trim()
          : !serviceProduct.trim() || !proposalAmount || !proposalFollowUpDate
      ) {
        notify(
          negotiationCompletion
            ? "Enter the contact details, customer response, requirement, and next follow-up."
            : "Enter the service or product, proposal amount, and follow-up date.",
          "error",
        );
        return;
      }
      if (!negotiationCompletion && Number(discount || 0) > Number(proposalAmount)) {
        notify("Discount cannot exceed proposal amount.", "error");
        return;
      }
    } else if (
      !["WON", "LOST"].includes(item.lead.stage) &&
      (!nextDueAt || !nextActionText.trim())
    ) {
      notify(
        !nextActionText.trim()
          ? "Enter the next action."
          : `Choose the next ${itemLabel} date and time.`,
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
            ? isNegotiation || item.type === "Negotiation"
              ? businessDateTimeIso(nextDueAt)
              : businessDateTimeIso(`${proposalFollowUpDate}T00:00`)
            : nextDueAt && nextActionText.trim()
              ? businessDateTimeIso(nextDueAt)
              : undefined,
          nextAction: completing
            ? isNegotiation || item.type === "Negotiation"
              ? nextActionText.trim()
              : "Follow up on proposal"
            : nextActionText.trim() || undefined,
          remarks: completing
            ? undefined
            : outcomeNotes.trim() || undefined,
          ...(editing.status === "RESCHEDULED"
            ? { rescheduleReason }
            : {}),
          ...(completing && !(isNegotiation || item.type === "Negotiation")
            ? {
                nextStage: "PROPOSAL",
                proposalDate: new Date(
                  `${businessDateKey(new Date())}T00:00:00.000Z`,
                ).toISOString(),
                serviceProduct: serviceProduct.trim(),
                proposalAmount: Number(proposalAmount),
                discount: Number(discount || 0),
              }
            : {}),
          ...(completing && (isNegotiation || item.type === "Negotiation")
            ? {
                contactDate: new Date(
                  `${contactDate}T00:00:00.000Z`,
                ).toISOString(),
                contactType,
                customerResponse: customerResponse.trim(),
                requirement: requirement.trim(),
                nextStage: "NEGOTIATION",
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
      setServiceProduct("");
      setProposalAmount("");
      setDiscount("");
      setCustomerResponse("");
      setRequirement("");
      setContactDate(businessDateKey(new Date()));
      setRescheduleReason("Customer requested");
      setPage(1);
      notify(
        nextStatus === "COMPLETED"
          ? isNegotiation || completingItem?.type === "Negotiation"
            ? `${itemTitle} completed and next action scheduled.`
            : `Proposal prepared and ${itemLabel} completed.`
          : `${itemTitle} rescheduled with one successor action.`,
      );
      await load();
    } catch (reason) {
      notify(
        reason instanceof Error
          ? reason.message
          : `Unable to update ${itemLabel}.`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveProposalResponse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const isNegotiationResponse = responseItem?.type === "Negotiation";
    const responseTarget = isNegotiationResponse
      ? responseItem?.lead.negotiations?.[0]
      : responseItem?.proposal;
    if (!responseItem || !responseTarget) return;
    const requiresCustomerResponse =
      isNegotiationResponse || proposalNextAction === "Negotiation";
    if (
      responseMode === "new" &&
      requiresCustomerResponse &&
      !proposalResponse.trim()
    ) {
      notify("Enter the customer's response.", "error");
      return;
    }
    if (responseMode === "new" && !proposalNextAction) {
      notify("Choose the next action.", "error");
      return;
    }
    if (
      !isNegotiation &&
      responseMode === "new" &&
      proposalNextAction === "Negotiation" &&
      (customerExpectedAmount === "" ||
        Number.isNaN(Number(customerExpectedAmount)) ||
        Number(customerExpectedAmount) < 0)
    ) {
      notify("Enter the customer's expected amount.", "error");
      return;
    }
    if (
      responseMode === "new" &&
      proposalNextAction === "Won" &&
      (!expectedTimeline.trim() ||
        !paymentStatus ||
        (paymentStatus === "Advance Payment" &&
          (!advanceAmount ||
            Number.isNaN(Number(advanceAmount)) ||
            Number(advanceAmount) <= 0)))
    ) {
      notify(
        "Enter the expected timeline and required payment details for a Won outcome.",
        "error",
      );
      return;
    }
    setBusy(true);
    try {
      const editingSavedResponse = responseMode === "edit";
      await apiClient(
        `/${isNegotiationResponse ? "negotiations" : "proposals"}/${responseTarget.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            ...(proposalResponse.trim()
              ? { customerResponse: proposalResponse.trim() }
              : {}),
            ...(editingSavedResponse
              ? {}
              : {
                  nextAction: proposalNextAction,
                  ...(proposalNextAction === "Negotiation"
                    ? {
                        customerExpectedAmount: Number(customerExpectedAmount),
                      }
                    : {}),
                  lostReason:
                    proposalNextAction === "Lost"
                      ? proposalLostReason
                      : undefined,
                  ...(proposalNextAction === "Won"
                    ? {
                        expectedTimeline: expectedTimeline.trim(),
                        paymentStatus,
                        ...(paymentStatus === "Advance Payment"
                          ? { advanceAmount: Number(advanceAmount) }
                          : {}),
                      }
                    : {}),
                }),
          }),
        },
      );
      notifyLeadUpdated(responseItem.lead.id);
      notify(
        editingSavedResponse
          ? `${itemTitle} response updated.`
          : proposalResponse.trim()
            ? `${itemTitle} response saved. Lead moved to ${proposalNextAction}.`
            : `${itemTitle} marked ${proposalNextAction}.`,
      );
      setResponseItem(null);
      setProposalResponse("");
      setCustomerExpectedAmount("");
      setProposalNextAction("Negotiation");
      setProposalLostReason(LOST_REASONS[0]);
      setExpectedTimeline("");
      setPaymentStatus("");
      setAdvanceAmount("");
      setResponseMode("new");
      await load();
    } catch (reason) {
      notify(
        reason instanceof Error
          ? reason.message
          : `Unable to save ${itemLabel} response.`,
        "error",
      );
    } finally {
      setBusy(false);
    }
  }

  function beginCustomerResponse(
    item: FollowUp,
    mode: "new" | "view" = "new",
  ) {
    setResponseItem(item);
    setResponseMode(mode);
    setProposalResponse(
      mode === "view"
        ? (item.type === "Negotiation"
            ? item.lead.negotiations?.[0]?.customerResponse
            : item.proposal?.customerResponse) ?? ""
        : item.type === "Negotiation"
          ? item.lead.activities?.[0]?.customerResponse ?? ""
          : "",
    );
    setProposalNextAction(item.type === "Negotiation" ? "" : "Negotiation");
    setCustomerExpectedAmount("");
    setProposalLostReason(LOST_REASONS[0]);
    setExpectedTimeline("");
    setPaymentStatus("");
    setAdvanceAmount("");
  }

  function beginUpdate(item: FollowUp, status: FollowUpStatus) {
    setEditing({ id: item.id, status });
    setNextDueAt(businessInputValue(new Date(Date.now() + 86400000)));
    setProposalFollowUpDate(businessDateKey(new Date(Date.now() + 86400000)));
    setNextActionText(status === "RESCHEDULED" ? item.nextAction : "");
    setOutcomeNotes(item.remarks ?? "");
    setServiceProduct("");
    setProposalAmount("");
    setDiscount("");
  }

  const completingItem =
    editing?.status === "COMPLETED"
      ? items.find((item) => item.id === editing.id)
      : undefined;
  const reschedulingItem =
    editing?.status === "RESCHEDULED"
      ? items.find((item) => item.id === editing.id)
      : undefined;
  const completingNegotiation =
    isNegotiation || completingItem?.type === "Negotiation";
  return (
    <main className="lead-workspace follow-up-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">DAILY SALES ROUTINE</p>
          <h1>{workspaceTitle}</h1>
          <p className="subtitle">
            Keep customer commitments visible and every open lead scheduled.
          </p>
        </div>
        <div className="workspace-actions">
          <Link className="secondary-action" href="/leads">
            All leads
          </Link>
          <button className="primary" onClick={() => setShowCreate(true)}>
            + Schedule {itemLabel}
          </button>
        </div>
      </header>
      <div className="follow-up-search-row">
        <label className="search-field follow-up-search">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label={`Search ${itemPlural}`}
            placeholder="Search lead, phone, BDE, action, or notes"
            value={search}
            onChange={(event) => {
              resetPage();
              setSearch(event.target.value);
            }}
          />
        </label>
        <MobileFilterToggle
          expanded={mobileFiltersOpen}
          onToggle={() => setMobileFiltersOpen((open) => !open)}
        />
      </div>
      <div className="follow-up-results-layout">
        <aside
          className={`follow-up-filters${mobileFiltersOpen ? "" : " mobile-filter-closed"}`}
          aria-label={`Filter ${itemPlural}`}
        >
          <MobileFilterContent expanded={mobileFiltersOpen}>
          <h2>Filter {itemTitle}s</h2>
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
                    {types.map((item) => (
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
              {!isNegotiation && (
                <label className="follow-up-filter-checkbox">
                  <input
                    type="checkbox"
                    checked={pendingResponseOnly}
                    onChange={(event) => {
                      resetPage();
                      setPendingResponseOnly(event.target.checked);
                    }}
                  />
                  Pending response
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
            setPendingResponseOnly(false);
            setFrom("");
            setTo("");
          }}
        >
          Clear filters
        </button>
          </MobileFilterContent>
        </aside>
        <section className="follow-up-list">
        {!loading && items.length > 0 && (
          <div className="follow-up-list-header" aria-hidden="true">
            <span>Due date</span>
            <span>Lead / customer</span>
            <span>Assigned BDE</span>
            <span>{itemTitle}</span>
            <span>Actions</span>
          </div>
        )}
        {loading && (
          <p className="dashboard-loading" role="status">
            Loading {itemPlural}...
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
                {item.status === "COMPLETED" &&
                  (isNegotiation
                    ? item.type === "Negotiation" &&
                      item.lead.negotiations?.length
                    : item.type === "Proposal Follow-up" && item.proposal) && (
                    <div className="follow-up-controls">
                      {(isNegotiation
                        ? item.lead.negotiations?.[0]?.responseSavedAt
                        : item.proposal?.responseSavedAt) ? (
                        <button
                          disabled={busy}
                          onClick={() => beginCustomerResponse(item, "view")}
                        >
                          View
                        </button>
                      ) : (
                        <button
                          disabled={busy}
                          onClick={() => beginCustomerResponse(item)}
                        >
                          Save response
                        </button>
                      )}
                    </div>
                  )}
              </article>
            );
          })}
        {!loading && !error && items.length === 0 && (
          <div className="empty-list">
            No {itemPlural} match these filters.
          </div>
        )}
        </section>
      </div>
      {responseItem &&
        (responseItem.type === "Negotiation"
          ? responseItem.lead.negotiations?.[0]
          : responseItem.proposal) && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setResponseItem(null);
          }}
        >
          <section
            className="lead-modal follow-up-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="proposal-response-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">
                  {responseItem.type === "Negotiation"
                    ? "NEGOTIATION RESPONSE"
                    : "PROPOSAL RESPONSE"}
                </p>
                <h2 id="proposal-response-title">
                  {responseMode === "view"
                    ? "Customer response"
                    : responseMode === "edit"
                      ? "Edit customer response"
                      : "Save customer response"}
                </h2>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label="Close"
                onClick={() => setResponseItem(null)}
              >
                ×
              </button>
            </div>
            {responseMode === "view" ? (
              <div className="lead-form">
                <label className="form-wide">
                  Customer response
                  <textarea
                    rows={3}
                    readOnly
                    placeholder="No customer response was provided."
                    value={proposalResponse}
                  />
                </label>
                <div className="form-footer">
                  <p>
                    Outcome:{" "}
                    {responseItem.type === "Negotiation"
                      ? responseItem.lead.negotiations?.[0]?.nextAction ?? "—"
                      : responseItem.proposal?.responseSavedAt
                        ? responseItem.nextAction
                        : "—"}
                  </p>
                  <div>
                    <button
                      className="secondary-action"
                      type="button"
                      onClick={() => setResponseItem(null)}
                    >
                      Close
                    </button>
                    <button
                      className="primary"
                      type="button"
                      onClick={() => setResponseMode("edit")}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <form className="lead-form" onSubmit={saveProposalResponse}>
                {responseMode === "new" && (
                  <>
                    <label className="form-wide">
                      Next action *
                      <select
                        required
                        value={proposalNextAction}
                        onChange={(event) => {
                          setProposalNextAction(
                            event.target.value as
                              | "Negotiation"
                              | "Won"
                              | "Lost",
                          );
                          setExpectedTimeline("");
                          setPaymentStatus("");
                          setAdvanceAmount("");
                        }}
                      >
                          {responseItem.type === "Negotiation" && (
                            <option value="">Choose outcome</option>
                        )}
                          {responseItem.type !== "Negotiation" && (
                            <option value="Negotiation">Negotiation</option>
                          )}
                        <option value="Won">Won</option>
                        <option value="Lost">Lost</option>
                      </select>
                    </label>
                    {(responseItem.type === "Negotiation" ||
                      proposalNextAction === "Negotiation") && (
                      <label className="form-wide">
                        Customer response *
                        <textarea
                          required
                          rows={3}
                          value={proposalResponse}
                          onChange={(event) =>
                            setProposalResponse(event.target.value)
                          }
                        />
                      </label>
                    )}
                    {proposalNextAction === "Negotiation" && (
                      <label className="form-wide">
                        Customer expected amount (₹) *
                        <input
                          required
                          min="0"
                          step="0.01"
                          type="number"
                          value={customerExpectedAmount}
                          onChange={(event) =>
                            setCustomerExpectedAmount(event.target.value)
                          }
                        />
                      </label>
                    )}
                    {proposalNextAction === "Lost" && (
                      <label className="form-wide">
                        Lost reason *
                        <select
                          required
                          value={proposalLostReason}
                          onChange={(event) =>
                            setProposalLostReason(event.target.value)
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
                    {proposalNextAction === "Won" && (
                      <>
                        <label className="form-wide">
                          Expected timeline *
                          <input
                            required
                            value={expectedTimeline}
                            onChange={(event) =>
                              setExpectedTimeline(event.target.value)
                            }
                          />
                        </label>
                        <label className="form-wide">
                          Payment status *
                          <select
                            required
                            value={paymentStatus}
                            onChange={(event) =>
                              setPaymentStatus(
                                event.target.value as
                                  | ""
                                  | (typeof WON_PAYMENT_STATUSES)[number],
                              )
                            }
                          >
                            <option value="">Choose payment status</option>
                            {WON_PAYMENT_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </label>
                        {paymentStatus === "Advance Payment" && (
                          <label className="form-wide">
                            Advance amount (₹) *
                            <input
                              required
                              min="0.01"
                              step="0.01"
                              type="number"
                              value={advanceAmount}
                              onChange={(event) =>
                                setAdvanceAmount(event.target.value)
                              }
                            />
                          </label>
                        )}
                      </>
                    )}
                  </>
                )}
                {responseMode === "edit" && (
                  <label className="form-wide">
                    Customer response
                    <textarea
                      rows={3}
                      value={proposalResponse}
                      onChange={(event) => setProposalResponse(event.target.value)}
                    />
                  </label>
                )}
                <div className="form-footer">
                  <p>
                    {responseMode === "edit"
                      ? "The saved outcome will not change."
                      : "This response can only be saved once."}
                  </p>
                  <div>
                    <button
                      className="secondary-action"
                      disabled={busy}
                      onClick={() =>
                        responseMode === "edit"
                          ? setResponseMode("view")
                          : setResponseItem(null)
                      }
                      type="button"
                    >
                      Cancel
                    </button>
                    <button className="primary" disabled={busy}>
                      {busy
                        ? "Saving..."
                        : responseMode === "edit"
                          ? "Save changes"
                          : "Save response"}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
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
                <h2 id="reschedule-follow-up-title">
                  Reschedule {itemLabel}
                </h2>
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
                    label={`Next ${itemLabel}`}
                    required
                    minValue={businessInputValue(new Date())}
                    value={nextDueAt}
                    onChange={setNextDueAt}
                  />
                </>
              )}
              <div className="form-footer">
                <p>
                  This reason and any remarks are saved on the rescheduled{" "}
                  {itemLabel}.
                </p>
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
                <p className="eyebrow">
                  {completingNegotiation
                    ? "NEGOTIATION DETAILS"
                    : "PROPOSAL DETAILS"}
                </p>
                <h2 id="complete-follow-up-title">
                  {completingNegotiation
                    ? "Complete negotiation follow-up"
                    : "Prepare proposal"}
                </h2>
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
              {completingNegotiation ? (
                <>
                  <label>
                    Lead name
                    <input disabled value={completingItem.lead.customerName} />
                  </label>
                  <label>
                    Contact date *
                    <input
                      required
                      type="date"
                      max={businessDateKey(new Date())}
                      value={contactDate}
                      onChange={(event) => setContactDate(event.target.value)}
                    />
                  </label>
                  <label>
                    Contact type *
                    <select
                      required
                      value={contactType}
                      onChange={(event) =>
                        setContactType(
                          event.target.value as (typeof CONTACT_TYPES)[number],
                        )
                      }
                    >
                      {CONTACT_TYPES.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-wide">
                    Customer response *
                    <textarea
                      required
                      rows={2}
                      value={customerResponse}
                      onChange={(event) => setCustomerResponse(event.target.value)}
                    />
                  </label>
                  <label className="form-wide">
                    Requirement *
                    <textarea
                      required
                      rows={2}
                      value={requirement}
                      onChange={(event) => setRequirement(event.target.value)}
                    />
                  </label>
                  <label className="form-wide">
                    Next action *
                    <input
                      required
                      value={nextActionText}
                      onChange={(event) => setNextActionText(event.target.value)}
                    />
                  </label>
                  <ClockDateTimePicker
                    className="form-wide"
                    label="Next negotiation"
                    required
                    minValue={businessInputValue(new Date())}
                    value={nextDueAt}
                    onChange={setNextDueAt}
                  />
                  <div className="form-footer">
                    <p>
                      Completing logs the customer contact and schedules the
                      next negotiation action.
                    </p>
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
                        {busy ? "Saving..." : "Complete negotiation"}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
              <ProposalCompletionFields
                leadName={completingItem.lead.customerName}
                serviceProduct={serviceProduct}
                proposalAmount={proposalAmount}
                discount={discount}
                followUpDate={proposalFollowUpDate}
                setServiceProduct={setServiceProduct}
                setProposalAmount={setProposalAmount}
                setDiscount={setDiscount}
                setFollowUpDate={setProposalFollowUpDate}
              />
              <div className="form-footer">
                <p>
                  Saving records the proposal and updates the lead&apos;s next
                  action and follow-up date.
                </p>
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
                    {busy ? "Saving..." : "Prepare proposal"}
                  </button>
                </div>
              </div>
                </>
              )}
            </form>
          </section>
        </div>
      )}
      {!loading && !error && (
        <nav
          className="pagination"
          aria-label={`${itemTitle} pagination`}
        >
          <span>
            {items.length} {items.length === 1 ? itemLabel : itemPlural} ·
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
                <h2 id="follow-up-title">Schedule {itemLabel}</h2>
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
                {itemTitle} type
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                >
                  {types.map((item) => (
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
