"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { apiClient } from "../../lib/api-client";
import { LEAD_UPDATED_EVENT } from "../../lib/lead-events";
import { getAuthUser } from "../../lib/auth";
import { notify } from "../../lib/notifications";
import { ClockDateTimePicker } from "../../components/shared/clock-date-time-picker";
import { LOST_REASONS } from "./lost-reasons";
import {
  businessDateTimeInputValue,
  businessDateTimeToIso,
} from "../../lib/business-time";

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
const CONTACT_TYPES = [
  "Phone Call",
  "WhatsApp",
  "Email",
  "Direct Meeting",
  "Other",
] as const;
const MEETING_TYPES = [
  "Online Meeting",
  "Offline Meeting",
  "Product Demo",
  "Requirement Discussion",
  "Business Discussion",
] as const;
const PAYMENT_STATUSES = [
  "Advance Pending",
  "Partially Paid",
  "Paid",
  "Pending",
];

type Stage = (typeof STAGES)[number];
type PipelineDisplay = "list" | "kanban";
const PIPELINE_PAGE_SIZE = 4;
const INITIAL_STAGE_PAGES = Object.fromEntries(
  STAGES.map((stage) => [stage, 1]),
) as Record<Stage, number>;
type Priority = (typeof PRIORITIES)[number];
type Lead = {
  id: string;
  leadNumber: string;
  leadDate: string;
  customerName: string;
  businessName?: string | null;
  mobileNumber: string;
  requirement?: string | null;
  estimatedBudget?: string | number | null;
  priority: Priority;
  stage: Stage;
  nextAction?: string | null;
  followUpAt?: string | null;
  remarks?: string | null;
  createdAt: string;
  assignedBde: { id: string; fullName: string };
};
type LeadEditRecord = Omit<Lead, "createdAt"> & {
  email?: string | null;
  location?: string | null;
  businessCategory?: string | null;
  leadSource: string;
  finalDealValue?: string | number | null;
  wonService?: string | null;
  paymentStatus?: string | null;
  expectedStartDate?: string | null;
  wonRemarks?: string | null;
  lostReason?: string | null;
};
type Assignee = { id: string; fullName: string; role: string };
type LeadForm = {
  leadDate: string;
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
  stage: Stage;
  nextAction: string;
  followUpAt: string;
  remarks: string;
  finalDealValue: string;
  wonService: string;
  paymentStatus: string;
  expectedStartDate: string;
  wonRemarks: string;
  lostReason: string;
  otherLostReason: string;
};

function localDateInputValue(date = new Date()) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function followUpDateInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : localDateInputValue(date);
}

function followUpDateToIso(value: string) {
  return businessDateTimeToIso(`${value}T09:00`);
}

function localDateTimeInputValue(value?: string | null) {
  return businessDateTimeInputValue(value);
}

function createEmptyLeadForm(): LeadForm {
  return {
    leadDate: localDateInputValue(),
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
    stage: "NEW_LEAD",
    nextAction: "",
    followUpAt: "",
    remarks: "",
    finalDealValue: "",
    wonService: "",
    paymentStatus: PAYMENT_STATUSES[0],
    expectedStartDate: "",
    wonRemarks: "",
    lostReason: LOST_REASONS[0],
    otherLostReason: "",
  };
}

function stageName(stage: Stage) {
  return stage.replaceAll("_", " ");
}

function isTerminalStage(stage: Stage) {
  return stage === "WON" || stage === "LOST";
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
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

function PipelineViewIcon({ view }: { view: PipelineDisplay }) {
  if (view === "list") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M7 5h9M7 10h9M7 15h9M3.5 5h.01M3.5 10h.01M3.5 15h.01" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2.5" y="3" width="4.5" height="14" rx="1" />
      <rect x="8" y="3" width="4.5" height="9" rx="1" />
      <rect x="13.5" y="3" width="4" height="11" rx="1" />
    </svg>
  );
}

export function LeadWorkspace({
  view,
  initialShowForm = false,
}: {
  view: "leads" | "pipeline";
  initialShowForm?: boolean;
}) {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [form, setForm] = useState<LeadForm>(createEmptyLeadForm);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [originalAssignedBdeId, setOriginalAssignedBdeId] = useState("");
  const [originalAssignedBdeName, setOriginalAssignedBdeName] = useState("");
  const [loadingEditLeadId, setLoadingEditLeadId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pipelineDisplay, setPipelineDisplay] =
    useState<PipelineDisplay>("list");
  const [showForm, setShowForm] = useState(initialShowForm);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stageFormError, setStageFormError] = useState("");
  const [canAssignLeads, setCanAssignLeads] = useState(false);
  const isAdmin = getAuthUser()?.role === "ADMIN";
  const [deletingLeadId, setDeletingLeadId] = useState<string | null>(null);
  const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null);
  const [dropTargetStage, setDropTargetStage] = useState<Stage | null>(null);
  const [stagePages, setStagePages] =
    useState<Record<Stage, number>>(INITIAL_STAGE_PAGES);
  const movedLeadToTopByStage = useRef<Partial<Record<Stage, string>>>({});
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
  const [contactDate, setContactDate] = useState(localDateInputValue());
  const [contactType, setContactType] =
    useState<(typeof CONTACT_TYPES)[number]>("Phone Call");
  const [customerResponse, setCustomerResponse] = useState("");
  const [contactRequirement, setContactRequirement] = useState("");
  const [contactBudget, setContactBudget] = useState("");
  const [expectedTimeline, setExpectedTimeline] = useState("");
  const [contactRemarks, setContactRemarks] = useState("");
  const [transitionFollowUpAt, setTransitionFollowUpAt] = useState("");
  const [transitionNextAction, setTransitionNextAction] = useState("");
  const [transitionMeetingAt, setTransitionMeetingAt] = useState("");
  const [transitionMeetingType, setTransitionMeetingType] = useState<
    (typeof MEETING_TYPES)[number]
  >("Requirement Discussion");
  const [transitionDiscussionNotes, setTransitionDiscussionNotes] =
    useState("");
  const [transitionCustomerConcerns, setTransitionCustomerConcerns] =
    useState("");
  const [transitionProposalNumber, setTransitionProposalNumber] = useState("");
  const [transitionProposalDate, setTransitionProposalDate] = useState(
    localDateInputValue(),
  );
  const [transitionProposalService, setTransitionProposalService] =
    useState("");
  const [transitionProposalAmount, setTransitionProposalAmount] = useState("");
  const [transitionProposalDiscount, setTransitionProposalDiscount] =
    useState("");
  const [transitionProposalResponse, setTransitionProposalResponse] =
    useState("");
  const [transitionOriginalProposalAmount, setTransitionOriginalProposalAmount] =
    useState("");
  const [loadingTransitionProposalAmount, setLoadingTransitionProposalAmount] =
    useState(false);
  const [transitionCustomerExpectedAmount, setTransitionCustomerExpectedAmount] =
    useState("");
  const [transitionNegotiatedAmount, setTransitionNegotiatedAmount] =
    useState("");
  const [transitionNegotiationConcern, setTransitionNegotiationConcern] =
    useState("");

  async function load() {
    setLoading(true);
    try {
      const [leadRows, users] = await Promise.all([
        apiClient<Lead[]>("/leads"),
        apiClient<Assignee[]>("/leads/assignees"),
      ]);
      setLeads(
        [...leadRows].sort((left, right) => {
          const leftPinned = movedLeadToTopByStage.current[left.stage];
          const rightPinned = movedLeadToTopByStage.current[right.stage];
          return (
            Number(right.id === rightPinned) - Number(left.id === leftPinned)
          );
        }),
      );
      setAssignees(users);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to load leads.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const role = getAuthUser()?.role;
    setCanAssignLeads(role === "ADMIN" || role === "SALES_MANAGER");
    void load();
    const refreshLeads = () => void load();
    window.addEventListener(LEAD_UPDATED_EVENT, refreshLeads);
    return () => window.removeEventListener(LEAD_UPDATED_EVENT, refreshLeads);
  }, []);

  async function saveLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !form.followUpAt &&
      (!editingLeadId || !isTerminalStage(form.stage))
    ) {
      notify("Choose a follow-up date.", "error");
      return;
    }
    setBusy(true);
    try {
      if (editingLeadId) {
        await apiClient<Lead>(`/leads/${editingLeadId}`, {
          method: "PATCH",
          body: JSON.stringify({
            customerName: form.customerName,
            businessName: form.businessName || null,
            leadDate: new Date(`${form.leadDate}T00:00:00.000Z`).toISOString(),
            mobileNumber: form.mobileNumber,
            email: form.email || null,
            location: form.location || null,
            businessCategory: form.businessCategory || null,
            requirement: form.requirement || null,
            estimatedBudget: form.estimatedBudget
              ? Number(form.estimatedBudget)
              : null,
            leadSource: form.leadSource,
            priority: form.priority,
            ...(form.assignedBdeId !== originalAssignedBdeId
              ? { assignedBdeId: form.assignedBdeId }
              : {}),
            nextAction: form.nextAction || null,
            ...(form.followUpAt
              ? { followUpAt: followUpDateToIso(form.followUpAt) }
              : {}),
            remarks: form.remarks || null,
            finalDealValue:
              form.stage === "WON" && form.finalDealValue
                ? Number(form.finalDealValue)
                : null,
            wonService: form.stage === "WON" ? form.wonService || null : null,
            paymentStatus:
              form.stage === "WON" ? form.paymentStatus || null : null,
            expectedStartDate:
              form.stage === "WON" && form.expectedStartDate
                ? new Date(
                    `${form.expectedStartDate}T00:00:00.000Z`,
                  ).toISOString()
                : null,
            wonRemarks: form.stage === "WON" ? form.wonRemarks || null : null,
            lostReason:
              form.stage === "LOST"
                ? form.lostReason === "Other"
                  ? form.otherLostReason.trim()
                  : form.lostReason
                : null,
          }),
        });
        setForm({
          ...createEmptyLeadForm(),
          assignedBdeId: assignees[0]?.id ?? "",
        });
        setEditingLeadId(null);
        setOriginalAssignedBdeId("");
        setOriginalAssignedBdeName("");
        setShowForm(false);
        notify("Lead updated.");
        await load();
        return;
      }
      await apiClient<Lead>("/leads", {
        method: "POST",
        body: JSON.stringify({
          customerName: form.customerName,
          businessName: form.businessName || undefined,
          mobileNumber: form.mobileNumber,
          email: form.email || undefined,
          location: form.location || undefined,
          businessCategory: form.businessCategory || undefined,
          requirement: form.requirement || undefined,
          leadSource: form.leadSource,
          priority: form.priority,
          assignedBdeId: form.assignedBdeId,
          stage: form.stage,
          nextAction: form.nextAction,
          leadDate: new Date(`${form.leadDate}T00:00:00.000Z`).toISOString(),
          estimatedBudget: form.estimatedBudget
            ? Number(form.estimatedBudget)
            : undefined,
          followUpAt: followUpDateToIso(form.followUpAt),
          remarks: form.remarks || undefined,
          finalDealValue:
            form.stage === "WON" ? Number(form.finalDealValue) : undefined,
          wonService: form.stage === "WON" ? form.wonService : undefined,
          paymentStatus: form.stage === "WON" ? form.paymentStatus : undefined,
          expectedStartDate:
            form.stage === "WON" && form.expectedStartDate
              ? new Date(`${form.expectedStartDate}T00:00:00`).toISOString()
              : undefined,
          wonRemarks: form.stage === "WON" ? form.wonRemarks : undefined,
          lostReason:
            form.stage === "LOST"
              ? form.lostReason === "Other"
                ? form.otherLostReason.trim()
                : form.lostReason
              : undefined,
        }),
      });
      setForm({
        ...createEmptyLeadForm(),
        assignedBdeId: assignees[0]?.id ?? "",
      });
      setShowForm(false);
      setOriginalAssignedBdeId("");
      setOriginalAssignedBdeName("");
      notify(`Lead created in ${stageName(form.stage)} stage.`);
      await load();
      if (initialShowForm) router.replace("/leads");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save lead.";
      try {
        const response = JSON.parse(message) as { message?: string | string[] };
        notify(
          Array.isArray(response.message)
            ? response.message.join(", ")
            : response.message || message,
          "error",
        );
      } catch {
        notify(message, "error");
      }
    } finally {
      setBusy(false);
    }
  }

  async function editLead(lead: Lead) {
    setLoadingEditLeadId(lead.id);
    try {
      const record = await apiClient<LeadEditRecord>(`/leads/${lead.id}`);
      setForm({
        ...createEmptyLeadForm(),
        leadDate: record.leadDate.slice(0, 10),
        customerName: record.customerName,
        businessName: record.businessName ?? "",
        mobileNumber: record.mobileNumber,
        email: record.email ?? "",
        location: record.location ?? "",
        businessCategory: record.businessCategory ?? "",
        requirement: record.requirement ?? "",
        estimatedBudget:
          record.estimatedBudget === null ||
          record.estimatedBudget === undefined
            ? ""
            : String(record.estimatedBudget),
        leadSource: record.leadSource,
        priority: record.priority,
        assignedBdeId: record.assignedBde.id,
        stage: record.stage,
        nextAction: record.nextAction ?? "",
        followUpAt: followUpDateInputValue(record.followUpAt),
        remarks: record.remarks ?? "",
        finalDealValue:
          record.finalDealValue === null ||
          record.finalDealValue === undefined
            ? ""
            : String(record.finalDealValue),
        wonService: record.wonService ?? "",
        paymentStatus: record.paymentStatus ?? PAYMENT_STATUSES[0],
        expectedStartDate: record.expectedStartDate?.slice(0, 10) ?? "",
        wonRemarks: record.wonRemarks ?? "",
        lostReason: record.lostReason
          ? LOST_REASONS.includes(record.lostReason)
            ? record.lostReason
            : "Other"
          : LOST_REASONS[0],
        otherLostReason: LOST_REASONS.includes(record.lostReason ?? "")
          ? ""
          : (record.lostReason ?? ""),
      });
      setOriginalAssignedBdeId(record.assignedBde.id);
      setOriginalAssignedBdeName(record.assignedBde.fullName);
      setEditingLeadId(lead.id);
      setShowForm(true);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to load this lead.",
        "error",
      );
    } finally {
      setLoadingEditLeadId(null);
    }
  }

  function openCreateLeadForm() {
    setForm({
      ...createEmptyLeadForm(),
      assignedBdeId: assignees[0]?.id ?? "",
    });
    setEditingLeadId(null);
    setOriginalAssignedBdeId("");
    setOriginalAssignedBdeName("");
    setShowForm(true);
  }

  function closeLeadForm() {
    setShowForm(false);
    setEditingLeadId(null);
    setOriginalAssignedBdeId("");
    setOriginalAssignedBdeName("");
  }

  async function assignLead(lead: Lead, assignedBdeId: string) {
    try {
      await apiClient<Lead>(`/leads/${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify({ assignedBdeId }),
      });
      notify("Lead assignment updated.");
      await load();
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to assign this lead.",
        "error",
      );
    }
  }

  async function deleteLead(lead: Lead) {
    const confirmed = window.confirm(
      `Permanently delete ${lead.customerName} (${lead.leadNumber})? Its activities, follow-ups, proposals, meetings, and negotiations will also be deleted. This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeletingLeadId(lead.id);
    try {
      await apiClient(`/leads/${lead.id}`, { method: "DELETE" });
      setLeads((current) => current.filter((item) => item.id !== lead.id));
      notify(`Lead ${lead.leadNumber} was deleted.`);
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Unable to delete lead.",
        "error",
      );
    } finally {
      setDeletingLeadId(null);
    }
  }

  async function saveStage(lead: Lead, targetStage = stageEdit?.stage) {
    if (!targetStage) return;
    let createdProposalNumber: string | undefined;
    let createdNegotiation = false;
    const requiresMeeting =
      lead.stage === "INTERESTED" && targetStage === "MEETING";
    const requiresProposal =
      lead.stage === "MEETING" && targetStage === "PROPOSAL";
    const requiresNegotiation =
      lead.stage === "PROPOSAL" && targetStage === "NEGOTIATION";
    const requiresContactDetails =
      (lead.stage === "NEW_LEAD" && targetStage === "CONTACTED") ||
      (lead.stage === "CONTACTED" && targetStage === "INTERESTED");
    const requiresFollowUpPlan =
      lead.stage === "CONTACTED" && targetStage === "INTERESTED";
    const lostReason =
      lostReasonType === "Other" ? otherLostReason.trim() : lostReasonType;
    if (requiresContactDetails && !contactDate) {
      const message = "Enter the contact date before changing stage.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (requiresContactDetails && !customerResponse.trim()) {
      const message = "Enter the customer's response before changing stage.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (requiresFollowUpPlan && !transitionNextAction.trim()) {
      const message = "Enter the next action before moving to Interested.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (requiresFollowUpPlan && !transitionFollowUpAt) {
      const message = "Enter the follow-up date before moving to Interested.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (requiresMeeting && !transitionMeetingAt) {
      const message =
        "Enter the meeting date and time before moving to Meetings.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (requiresMeeting && !transitionNextAction.trim()) {
      const message = "Enter the next action before moving to Meetings.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (requiresMeeting && !transitionFollowUpAt) {
      const message =
        "Enter the next follow-up date before moving to Meetings.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (requiresProposal && !transitionProposalService.trim()) {
      const message = "Enter the proposal service before moving to Proposal.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (
      requiresProposal &&
      (!transitionProposalAmount ||
        !Number.isFinite(Number(transitionProposalAmount)) ||
        Number(transitionProposalAmount) < 0)
    ) {
      const message =
        "Enter a valid proposal amount before moving to Proposal.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (
      requiresProposal &&
      transitionProposalDiscount &&
      Number(transitionProposalDiscount) > Number(transitionProposalAmount)
    ) {
      const message = "Discount cannot exceed the proposal amount.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (requiresProposal && !transitionProposalDate) {
      const message = "Enter the proposal date before moving to Proposal.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (requiresProposal && !transitionFollowUpAt) {
      const message = "Enter a follow-up date before moving to Proposal.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (
      requiresNegotiation &&
      (!transitionOriginalProposalAmount ||
        !Number.isFinite(Number(transitionOriginalProposalAmount)))
    ) {
      const message = "Unable to load the latest proposal amount.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (
      requiresNegotiation &&
      (!transitionCustomerExpectedAmount ||
        !Number.isFinite(Number(transitionCustomerExpectedAmount)) ||
        Number(transitionCustomerExpectedAmount) < 0)
    ) {
      const message = "Enter a valid customer expected amount.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (
      requiresNegotiation &&
      (!transitionNegotiatedAmount ||
        !Number.isFinite(Number(transitionNegotiatedAmount)) ||
        Number(transitionNegotiatedAmount) < 0)
    ) {
      const message = "Enter a valid negotiated amount.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (requiresNegotiation && !transitionNextAction.trim()) {
      const message = "Enter the next action before moving to Negotiation.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (requiresNegotiation && !transitionFollowUpAt) {
      const message = "Enter a follow-up date before moving to Negotiation.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (targetStage === "WON" && !finalDealValue.trim()) {
      const message =
        "Enter a final deal value before marking this lead as won.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (targetStage === "WON" && !wonService.trim()) {
      const message =
        "Enter the service or project before marking this lead as won.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (targetStage === "LOST" && !lostReason) {
      const message = "Enter a lost reason before closing this lead.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    setStageFormError("");
    setBusy(true);
    try {
      if (requiresMeeting) {
        await apiClient("/meetings", {
          method: "POST",
          body: JSON.stringify({
            leadId: lead.id,
            meetingAt: businessDateTimeToIso(transitionMeetingAt),
            type: transitionMeetingType,
            discussionNotes: transitionDiscussionNotes.trim() || undefined,
            customerConcerns: transitionCustomerConcerns.trim() || undefined,
            nextAction: transitionNextAction.trim(),
            followUpAt: businessDateTimeToIso(transitionFollowUpAt),
          }),
        });
      } else if (requiresProposal) {
        const proposal = await apiClient<{ proposalNumber: string }>(
          "/proposals",
          {
            method: "POST",
            body: JSON.stringify({
              leadId: lead.id,
              proposalDate: new Date(
                `${transitionProposalDate}T00:00:00`,
              ).toISOString(),
              serviceProduct: transitionProposalService.trim(),
              proposalAmount: Number(transitionProposalAmount),
              discount: transitionProposalDiscount
                ? Number(transitionProposalDiscount)
                : 0,
              customerResponse: transitionProposalResponse.trim() || undefined,
              followUpAt: businessDateTimeToIso(transitionFollowUpAt),
              nextAction: lead.nextAction?.trim() || "Follow up on proposal",
            }),
          },
        );
        createdProposalNumber = proposal.proposalNumber;
      } else if (requiresNegotiation) {
        await apiClient("/negotiations", {
          method: "POST",
          body: JSON.stringify({
            leadId: lead.id,
            customerExpectedAmount: Number(transitionCustomerExpectedAmount),
            negotiatedAmount: Number(transitionNegotiatedAmount),
            customerConcern: transitionNegotiationConcern.trim() || undefined,
            nextAction: transitionNextAction.trim(),
            followUpAt: businessDateTimeToIso(transitionFollowUpAt),
          }),
        });
        createdNegotiation = true;
      } else {
        await apiClient<Lead>(`/leads/${lead.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            stage: targetStage,
            nextAction: requiresFollowUpPlan
              ? transitionNextAction.trim()
              : lead.nextAction,
            followUpAt: requiresFollowUpPlan
              ? businessDateTimeToIso(transitionFollowUpAt)
              : lead.followUpAt,
            finalDealValue:
              targetStage === "WON" ? Number(finalDealValue) : undefined,
            wonService: targetStage === "WON" ? wonService : undefined,
            paymentStatus: targetStage === "WON" ? paymentStatus : undefined,
            expectedStartDate:
              targetStage === "WON" && expectedStartDate
                ? new Date(expectedStartDate).toISOString()
                : undefined,
            wonRemarks: targetStage === "WON" ? wonRemarks : undefined,
            lostReason: targetStage === "LOST" ? lostReason : undefined,
            ...(requiresContactDetails
              ? {
                  contactDate: new Date(
                    `${contactDate}T00:00:00.000Z`,
                  ).toISOString(),
                  contactType,
                  customerResponse: customerResponse.trim(),
                }
              : {}),
            ...(requiresFollowUpPlan
              ? {
                  requirement: contactRequirement.trim(),
                  estimatedBudget: contactBudget ? Number(contactBudget) : null,
                  expectedTimeline: expectedTimeline.trim() || undefined,
                  remarks: contactRemarks.trim(),
                }
              : {}),
          }),
        });
      }
      movedLeadToTopByStage.current = {
        ...movedLeadToTopByStage.current,
        [targetStage]: lead.id,
      };
      setStagePages((current) => ({ ...current, [targetStage]: 1 }));
      setStageEdit(null);
      setFinalDealValue("");
      setWonService("");
      setPaymentStatus(PAYMENT_STATUSES[0]);
      setExpectedStartDate("");
      setWonRemarks("");
      setLostReasonType(LOST_REASONS[0]);
      setOtherLostReason("");
      setContactDate(localDateInputValue());
      setContactType("Phone Call");
      setCustomerResponse("");
      setContactRequirement("");
      setContactBudget("");
      setExpectedTimeline("");
      setContactRemarks("");
      setTransitionFollowUpAt("");
      setTransitionNextAction("");
      setTransitionMeetingAt("");
      setTransitionMeetingType("Requirement Discussion");
      setTransitionDiscussionNotes("");
      setTransitionCustomerConcerns("");
      setTransitionProposalNumber("");
      setTransitionProposalDate(localDateInputValue());
      setTransitionProposalService("");
      setTransitionProposalAmount("");
      setTransitionProposalDiscount("");
      setTransitionProposalResponse("");
      setTransitionOriginalProposalAmount("");
      setLoadingTransitionProposalAmount(false);
      setTransitionCustomerExpectedAmount("");
      setTransitionNegotiatedAmount("");
      setTransitionNegotiationConcern("");
      notify(
        createdProposalNumber
          ? `Proposal ${createdProposalNumber} created and lead moved to Proposal.`
          : createdNegotiation
            ? "Negotiation saved and lead moved to Negotiation."
            : `Lead moved to ${stageName(targetStage)}.`,
      );
      await load();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to update stage.";
      if (isTerminalStage(targetStage)) setStageFormError(message);
      else notify(message, "error");
    } finally {
      setBusy(false);
    }
  }

  function cancelStageEdit() {
    setStageEdit(null);
    setStageFormError("");
    setFinalDealValue("");
    setWonService("");
    setPaymentStatus(PAYMENT_STATUSES[0]);
    setExpectedStartDate("");
    setWonRemarks("");
    setLostReasonType(LOST_REASONS[0]);
    setOtherLostReason("");
    setContactDate(localDateInputValue());
    setContactType("Phone Call");
    setCustomerResponse("");
    setContactRequirement("");
    setContactBudget("");
    setExpectedTimeline("");
    setContactRemarks("");
    setTransitionFollowUpAt("");
    setTransitionNextAction("");
    setTransitionMeetingAt("");
    setTransitionMeetingType("Requirement Discussion");
    setTransitionDiscussionNotes("");
    setTransitionCustomerConcerns("");
    setTransitionProposalNumber("");
    setTransitionProposalDate(localDateInputValue());
    setTransitionProposalService("");
    setTransitionProposalAmount("");
    setTransitionProposalDiscount("");
    setTransitionProposalResponse("");
    setTransitionOriginalProposalAmount("");
    setLoadingTransitionProposalAmount(false);
    setTransitionCustomerExpectedAmount("");
    setTransitionNegotiatedAmount("");
    setTransitionNegotiationConcern("");
  }

  function beginStageEdit(lead: Lead, targetStage: Stage) {
    setStageFormError("");
    setFinalDealValue("");
    setWonService("");
    setContactDate(localDateInputValue());
    setContactType("Phone Call");
    setCustomerResponse("");
    setContactRequirement(lead.requirement ?? "");
    setContactBudget(
      lead.estimatedBudget === null || lead.estimatedBudget === undefined
        ? ""
        : String(lead.estimatedBudget),
    );
    setExpectedTimeline("");
    setContactRemarks(lead.remarks ?? "");
    setTransitionFollowUpAt(localDateTimeInputValue(lead.followUpAt));
    setTransitionNextAction(lead.nextAction ?? "");
    setTransitionMeetingAt("");
    setTransitionMeetingType("Requirement Discussion");
    setTransitionDiscussionNotes("");
    setTransitionCustomerConcerns("");
    setTransitionProposalNumber("");
    setTransitionProposalDate(localDateInputValue());
    setTransitionProposalService("");
    setTransitionProposalAmount("");
    setTransitionProposalDiscount("");
    setTransitionProposalResponse("");
    setTransitionOriginalProposalAmount("");
    setTransitionCustomerExpectedAmount("");
    setTransitionNegotiatedAmount("");
    setTransitionNegotiationConcern("");
    setStageEdit({ leadId: lead.id, stage: targetStage });
  }

  function handleLeadDrop(lead: Lead, targetStage: Stage) {
    setDropTargetStage(null);
    setDraggingLeadId(null);
    if (lead.stage === targetStage) return;
    if (isTerminalStage(lead.stage)) {
      notify("Won and lost leads cannot be moved to another stage.", "error");
      return;
    }

    beginStageEdit(lead, targetStage);
    if (isTerminalStage(targetStage)) return;
    if (
      (lead.stage === "NEW_LEAD" && targetStage === "CONTACTED") ||
      (lead.stage === "CONTACTED" && targetStage === "INTERESTED") ||
      (lead.stage === "INTERESTED" && targetStage === "MEETING") ||
      (lead.stage === "MEETING" && targetStage === "PROPOSAL")
    )
      return;

    void saveStage(lead, targetStage);
  }

  const filtered = leads.filter((lead) =>
    [
      lead.customerName,
      lead.businessName,
      lead.mobileNumber,
      lead.assignedBde.fullName,
    ].some((value) => value?.toLowerCase().includes(search.toLowerCase())),
  );
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleLeads = filtered.slice((page - 1) * pageSize, page * pageSize);
  const stageEditLead = stageEdit
    ? leads.find((lead) => lead.id === stageEdit.leadId)
    : undefined;
  const stageEditNeedsContact =
    stageEdit !== null &&
    stageEditLead !== undefined &&
    ((stageEditLead.stage === "NEW_LEAD" && stageEdit.stage === "CONTACTED") ||
      (stageEditLead.stage === "CONTACTED" &&
        stageEdit.stage === "INTERESTED"));
  const stageEditNeedsFollowUpPlan =
    stageEditLead?.stage === "CONTACTED" && stageEdit?.stage === "INTERESTED";
  const stageEditNeedsMeeting =
    stageEditLead?.stage === "INTERESTED" && stageEdit?.stage === "MEETING";
  const stageEditNeedsProposal =
    stageEditLead?.stage === "MEETING" && stageEdit?.stage === "PROPOSAL";
  const stageEditNeedsNegotiation =
    stageEditLead?.stage === "PROPOSAL" && stageEdit?.stage === "NEGOTIATION";
  const stageEditNeedsWonFromProposal =
    stageEditLead?.stage === "PROPOSAL" && stageEdit?.stage === "WON";
  const stageEditNeedsModal =
    stageEdit !== null &&
    (isTerminalStage(stageEdit.stage) ||
      stageEditNeedsContact ||
      stageEditNeedsMeeting ||
      stageEditNeedsProposal ||
      stageEditNeedsNegotiation);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!stageEditNeedsProposal) return;
    let active = true;
    apiClient<{ proposalNumber: string }>("/proposals/next-number")
      .then((preview) => {
        if (active) setTransitionProposalNumber(preview.proposalNumber);
      })
      .catch((error: unknown) => {
        if (!active) return;
        notify(
          error instanceof Error
            ? error.message
            : "Unable to load the next proposal number.",
          "error",
        );
      });
    return () => {
      active = false;
    };
  }, [stageEditNeedsProposal, stageEdit?.leadId]);

  useEffect(() => {
    if (
      (!stageEditNeedsNegotiation && !stageEditNeedsWonFromProposal) ||
      !stageEdit?.leadId
    )
      return;
    let active = true;
    setTransitionOriginalProposalAmount("");
    setLoadingTransitionProposalAmount(true);
    apiClient<{
      originalProposalAmount: number | string;
      serviceProduct: string;
    }>(
      `/proposals/lead/${stageEdit.leadId}/latest`,
    )
      .then((proposal) => {
        if (active && stageEditNeedsNegotiation)
          setTransitionOriginalProposalAmount(
            String(proposal.originalProposalAmount),
          );
        if (active && stageEditNeedsWonFromProposal) {
          setFinalDealValue(String(proposal.originalProposalAmount));
          setWonService(proposal.serviceProduct);
        }
        if (active) setLoadingTransitionProposalAmount(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadingTransitionProposalAmount(false);
        notify(
          error instanceof Error
            ? error.message
            : "Unable to load the latest proposal amount.",
          "error",
        );
      });
    return () => {
      active = false;
    };
  }, [
    stageEditNeedsNegotiation,
    stageEditNeedsWonFromProposal,
    stageEdit?.leadId,
  ]);

  return (
    <main className="lead-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">SALES WORKSPACE</p>
          <h1>{view === "pipeline" ? "Sales Pipeline" : "Leads"}</h1>
          <p className="subtitle">
            {view === "pipeline"
              ? "Track every opportunity across its sales stages."
              : "Capture, assign, and keep every active lead moving."}
          </p>
        </div>
        <div className="workspace-actions">
          <Link
            className="secondary-action"
            href={
              view === "pipeline"
                ? "/leads"
                : canAssignLeads
                  ? "#lead-assignment"
                  : "/pipeline"
            }
          >
            {view === "pipeline"
              ? "Lead list"
              : canAssignLeads
                ? "Lead assignments"
                : "Sales Pipeline"}
          </Link>
          <button className="primary" onClick={openCreateLeadForm}>
            + Add lead
          </button>
        </div>
      </header>

      <div className="workspace-toolbar">
        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="Search leads"
            placeholder="Search customer, company, BDE..."
            value={search}
            onChange={(event) => {
              setPage(1);
              setStagePages(INITIAL_STAGE_PAGES);
              setSearch(event.target.value);
            }}
          />
        </label>
        <span className="result-count">
          {filtered.length} {filtered.length === 1 ? "lead" : "leads"}
        </span>
        {view === "pipeline" && (
          <div
            className="pipeline-view-switcher"
            role="group"
            aria-label="Sales Pipeline view"
          >
            {(["list", "kanban"] as const).map((display) => (
              <button
                aria-label={`${display === "kanban" ? "Kanban" : "List"} view`}
                aria-pressed={pipelineDisplay === display}
                className={pipelineDisplay === display ? "selected" : ""}
                key={display}
                onClick={() => setPipelineDisplay(display)}
                title={`${display === "kanban" ? "Kanban" : "List"} view`}
                type="button"
              >
                <PipelineViewIcon view={display} />
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && leads.length === 0 ? (
        <p className="dashboard-loading">Loading authorized leads...</p>
      ) : view === "pipeline" && pipelineDisplay === "kanban" ? (
        <div className="kanban-board">
          {STAGES.map((stage) => {
            const stageLeads = filtered.filter((lead) => lead.stage === stage);
            const stageTotalPages = Math.max(
              1,
              Math.ceil(stageLeads.length / PIPELINE_PAGE_SIZE),
            );
            const currentStagePage = Math.min(
              stagePages[stage],
              stageTotalPages,
            );
            const visibleStageLeads = stageLeads.slice(
              (currentStagePage - 1) * PIPELINE_PAGE_SIZE,
              currentStagePage * PIPELINE_PAGE_SIZE,
            );
            return (
              <section
                className={`kanban-column${dropTargetStage === stage ? " kanban-column-drop-target" : ""}`}
                key={stage}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDropTargetStage(stage);
                }}
                onDragLeave={(event) => {
                  if (
                    !event.currentTarget.contains(event.relatedTarget as Node)
                  )
                    setDropTargetStage(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const leadId =
                    event.dataTransfer.getData("text/plain") || draggingLeadId;
                  const draggedLead = leads.find((lead) => lead.id === leadId);
                  if (draggedLead) handleLeadDrop(draggedLead, stage);
                }}
              >
                <div className="kanban-heading">
                  <h2>{stageName(stage)}</h2>
                  <span>{stageLeads.length}</span>
                </div>
                <div
                  className="kanban-cards"
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDropTargetStage(stage);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const leadId =
                      event.dataTransfer.getData("text/plain") ||
                      draggingLeadId;
                    const draggedLead = leads.find(
                      (lead) => lead.id === leadId,
                    );
                    if (draggedLead) handleLeadDrop(draggedLead, stage);
                  }}
                >
                  {visibleStageLeads.map((lead) => (
                    <article
                      className={`lead-card${draggingLeadId === lead.id ? " lead-card-dragging" : ""}`}
                      draggable={!isTerminalStage(lead.stage)}
                      key={lead.id}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", lead.id);
                        setDraggingLeadId(lead.id);
                      }}
                      onDragEnd={() => {
                        setDraggingLeadId(null);
                        setDropTargetStage(null);
                      }}
                    >
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
                          disabled={isTerminalStage(lead.stage)}
                          value={
                            stageEdit?.leadId === lead.id
                              ? stageEdit.stage
                              : lead.stage
                          }
                          onChange={(event) => {
                            const target = event.target.value as Stage;
                            if (target !== lead.stage) {
                              beginStageEdit(lead, target);
                            } else {
                              cancelStageEdit();
                            }
                          }}
                        >
                          {STAGES.map((item) => (
                            <option key={item} value={item}>
                              {stageName(item)}
                            </option>
                          ))}
                        </select>
                      </label>
                      {stageEdit?.leadId === lead.id &&
                        !isTerminalStage(stageEdit.stage) &&
                        !stageEditNeedsModal && (
                          <div className="transition-editor">
                            <div>
                              <button
                                disabled={busy}
                                onClick={() =>
                                  void saveStage(lead, stageEdit.stage)
                                }
                              >
                                Save stage
                              </button>
                              <button
                                className="cancel-stage"
                                onClick={cancelStageEdit}
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
                {stageLeads.length > PIPELINE_PAGE_SIZE && (
                  <nav
                    className="kanban-pagination"
                    aria-label={`${stageName(stage)} leads pagination`}
                  >
                    <button
                      type="button"
                      disabled={currentStagePage === 1}
                      onClick={() =>
                        setStagePages((current) => ({
                          ...current,
                          [stage]: Math.max(1, currentStagePage - 1),
                        }))
                      }
                    >
                      Previous
                    </button>
                    <span>
                      {currentStagePage} / {stageTotalPages}
                    </span>
                    <button
                      type="button"
                      disabled={currentStagePage === stageTotalPages}
                      onClick={() =>
                        setStagePages((current) => ({
                          ...current,
                          [stage]: Math.min(
                            stageTotalPages,
                            currentStagePage + 1,
                          ),
                        }))
                      }
                    >
                      Next
                    </button>
                  </nav>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <>
          <div
            className="lead-table-wrap"
            id={canAssignLeads ? "lead-assignment" : undefined}
          >
            <table className="lead-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Company / Requirement</th>
                  <th>Stage</th>
                  {view === "pipeline" && <th>Move stage</th>}
                  <th>Priority</th>
                  <th>Assigned BDE</th>
                  <th>Next follow-up</th>
                  <th>Budget</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleLeads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <Link href={`/leads/${lead.id}`}>
                        {lead.customerName}
                      </Link>
                      <small>{lead.mobileNumber}</small>
                    </td>
                    <td>{lead.businessName || lead.requirement || "—"}</td>
                    <td>
                      <span className="stage-pill">
                        {stageName(lead.stage)}
                      </span>
                    </td>
                    {view === "pipeline" && (
                      <td className="pipeline-stage-actions">
                        <label className="stage-select-label">
                          <span className="visually-hidden">
                            Move {lead.customerName} to stage
                          </span>
                          <select
                            disabled={isTerminalStage(lead.stage)}
                            value={
                              stageEdit?.leadId === lead.id
                                ? stageEdit.stage
                                : lead.stage
                            }
                            onChange={(event) => {
                              const target = event.target.value as Stage;
                              if (target !== lead.stage) {
                                beginStageEdit(lead, target);
                              } else {
                                cancelStageEdit();
                              }
                            }}
                          >
                            {STAGES.map((stage) => (
                              <option key={stage} value={stage}>
                                {stageName(stage)}
                              </option>
                            ))}
                          </select>
                        </label>
                        {stageEdit?.leadId === lead.id &&
                          !isTerminalStage(stageEdit.stage) &&
                          !stageEditNeedsModal && (
                            <div className="pipeline-stage-edit-actions">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  void saveStage(lead, stageEdit.stage)
                                }
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={cancelStageEdit}
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                      </td>
                    )}
                    <td>
                      <span
                        className={`priority priority-${lead.priority.toLowerCase()}`}
                      >
                        {lead.priority}
                      </span>
                    </td>
                    <td>
                      {canAssignLeads && view !== "pipeline" ? (
                        <select
                          aria-label={`BDE assigned to ${lead.customerName}`}
                          value={lead.assignedBde.id}
                          onChange={(event) =>
                            void assignLead(lead, event.target.value)
                          }
                        >
                          {assignees.map((assignee) => (
                            <option key={assignee.id} value={assignee.id}>
                              {assignee.fullName}
                            </option>
                          ))}
                        </select>
                      ) : (
                        lead.assignedBde.fullName
                      )}
                    </td>
                    <td>
                      {displayDate(lead.followUpAt)}
                      <small>{lead.nextAction}</small>
                    </td>
                    <td>{displayMoney(lead.estimatedBudget)}</td>
                    <td className="lead-row-actions">
                      <button
                        className="lead-edit"
                        type="button"
                        disabled={loadingEditLeadId === lead.id}
                        onClick={() => void editLead(lead)}
                      >
                        {loadingEditLeadId === lead.id ? "Loading..." : "Edit"}
                      </button>
                      {isAdmin && (
                        <button
                          className="user-delete"
                          type="button"
                          disabled={deletingLeadId === lead.id}
                          onClick={() => void deleteLead(lead)}
                        >
                          {deletingLeadId === lead.id
                            ? "Deleting..."
                            : "Delete"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && filtered.length === 0 && (
              <div className="empty-list">
                No leads found. Add a lead to start tracking your pipeline.
              </div>
            )}
          </div>
          {!loading && (
            <nav className="pagination" aria-label="Leads pagination">
              <span>
                {filtered.length} {filtered.length === 1 ? "lead" : "leads"} ·
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
                <strong>
                  {page} / {totalPages}
                </strong>
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                  disabled={page === totalPages}
                >
                  Next
                </button>
              </div>
            </nav>
          )}
        </>
      )}

      {stageEdit && stageEditNeedsModal && stageEditLead && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy)
              cancelStageEdit();
          }}
        >
          <section
            className="lead-modal stage-transition-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="stage-transition-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">UPDATE OPPORTUNITY</p>
                <h2 id="stage-transition-title">
                  {stageEditNeedsContact
                    ? stageEdit.stage === "CONTACTED"
                      ? `Record contact with ${stageEditLead.customerName}`
                      : `Qualify ${stageEditLead.customerName}`
                    : stageEditNeedsMeeting
                      ? `Schedule a meeting with ${stageEditLead.customerName}`
                      : stageEditNeedsProposal
                        ? `Prepare proposal for ${stageEditLead.customerName}`
                          : stageEditNeedsNegotiation
                            ? `Start negotiation with ${stageEditLead.customerName}`
                            : `Move ${stageEditLead.customerName} to ${stageName(stageEdit.stage)}`}
                </h2>
              </div>
              <button
                className="modal-close"
                type="button"
                aria-label="Cancel stage change"
                disabled={busy}
                onClick={cancelStageEdit}
              >
                ×
              </button>
            </div>
            <form
              className="lead-form stage-transition-form"
              onSubmit={(event) => {
                event.preventDefault();
                void saveStage(stageEditLead, stageEdit.stage);
              }}
            >
              {stageFormError && (
                <div className="workspace-notice form-wide" role="alert">
                  {stageFormError}
                </div>
              )}
              {stageEditNeedsContact && (
                <>
                  <section className="lead-form-section form-wide">
                    <div>
                      <h3>Contact record</h3>
                      <p>Record how the customer responded</p>
                    </div>
                    <div className="lead-form-fields">
                      <label>
                        Contact Date *
                        <input
                          required
                          type="date"
                          value={contactDate}
                          onChange={(event) =>
                            setContactDate(event.target.value)
                          }
                        />
                      </label>
                      <label>
                        Contact Type *
                        <select
                          required
                          value={contactType}
                          onChange={(event) =>
                            setContactType(
                              event.target
                                .value as (typeof CONTACT_TYPES)[number],
                            )
                          }
                        >
                          {CONTACT_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="form-wide">
                        Customer Response *
                        <textarea
                          required
                          rows={2}
                          value={customerResponse}
                          onChange={(event) =>
                            setCustomerResponse(event.target.value)
                          }
                        />
                      </label>
                    </div>
                  </section>
                  {stageEditNeedsFollowUpPlan && (
                    <>
                      <section className="lead-form-section form-wide">
                        <div>
                          <h3>Opportunity qualification</h3>
                          <p>
                            Review and update the customer's existing details
                          </p>
                        </div>
                        <div className="lead-form-fields">
                          <label className="form-wide">
                            Requirement
                            <textarea
                              rows={2}
                              value={contactRequirement}
                              onChange={(event) =>
                                setContactRequirement(event.target.value)
                              }
                            />
                          </label>
                          <label>
                            Budget
                            <input
                              min="0"
                              type="number"
                              value={contactBudget}
                              onChange={(event) =>
                                setContactBudget(event.target.value)
                              }
                            />
                          </label>
                          <label>
                            Expected Timeline
                            <input
                              value={expectedTimeline}
                              onChange={(event) =>
                                setExpectedTimeline(event.target.value)
                              }
                            />
                          </label>
                          <label className="form-wide">
                            Remarks
                            <textarea
                              rows={2}
                              value={contactRemarks}
                              onChange={(event) =>
                                setContactRemarks(event.target.value)
                              }
                            />
                          </label>
                        </div>
                      </section>
                      <section className="lead-form-section form-wide">
                        <div>
                          <h3>Follow-up plan</h3>
                          <p>Set the next step and when it should happen</p>
                        </div>
                        <div className="lead-form-fields">
                          <ClockDateTimePicker
                            className="form-wide"
                            label="Follow-up"
                            required
                            value={transitionFollowUpAt}
                            onChange={setTransitionFollowUpAt}
                          />
                          <label>
                            Next Action *
                            <input
                              required
                              value={transitionNextAction}
                              onChange={(event) =>
                                setTransitionNextAction(event.target.value)
                              }
                              placeholder="e.g. Send proposal and call to discuss"
                            />
                          </label>
                        </div>
                      </section>
                    </>
                  )}
                </>
              )}
              {stageEditNeedsMeeting && (
                <>
                  <section className="lead-form-section form-wide">
                    <div>
                      <h3>Meeting details</h3>
                      <p>Plan the meeting and capture discussion context</p>
                    </div>
                    <div className="lead-form-fields">
                      <ClockDateTimePicker
                        className="form-wide"
                        label="Meeting"
                        required
                        value={transitionMeetingAt}
                        onChange={setTransitionMeetingAt}
                      />
                      <label>
                        Meeting Type *
                        <select
                          required
                          value={transitionMeetingType}
                          onChange={(event) =>
                            setTransitionMeetingType(
                              event.target
                                .value as (typeof MEETING_TYPES)[number],
                            )
                          }
                        >
                          {MEETING_TYPES.map((meetingType) => (
                            <option key={meetingType} value={meetingType}>
                              {meetingType}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="form-wide">
                        Discussion Notes
                        <textarea
                          rows={2}
                          value={transitionDiscussionNotes}
                          onChange={(event) =>
                            setTransitionDiscussionNotes(event.target.value)
                          }
                        />
                      </label>
                      <label className="form-wide">
                        Customer Concerns
                        <textarea
                          rows={2}
                          value={transitionCustomerConcerns}
                          onChange={(event) =>
                            setTransitionCustomerConcerns(event.target.value)
                          }
                        />
                      </label>
                    </div>
                  </section>
                  <section className="lead-form-section form-wide">
                    <div>
                      <h3>Follow-up plan</h3>
                      <p>Set the next step and when it should happen</p>
                    </div>
                    <div className="lead-form-fields">
                      <label>
                        Next Action *
                        <input
                          required
                          value={transitionNextAction}
                          onChange={(event) =>
                            setTransitionNextAction(event.target.value)
                          }
                        />
                      </label>
                      <ClockDateTimePicker
                        className="form-wide"
                        label="Next follow-up"
                        required
                        value={transitionFollowUpAt}
                        onChange={setTransitionFollowUpAt}
                      />
                    </div>
                  </section>
                </>
              )}
              {stageEditNeedsProposal && (
                <>
                  <section className="lead-form-section form-wide">
                    <div>
                      <h3>Proposal details</h3>
                      <p>
                        Review the proposal number, date, service, and pricing
                      </p>
                    </div>
                    <div className="lead-form-fields">
                      <label>
                        Proposal Number
                        <input
                          readOnly
                          value={transitionProposalNumber}
                          placeholder="Generating proposal number..."
                        />
                      </label>
                      <label>
                        Proposal Date *
                        <input
                          required
                          type="date"
                          value={transitionProposalDate}
                          onChange={(event) =>
                            setTransitionProposalDate(event.target.value)
                          }
                        />
                      </label>
                      <label className="form-wide">
                        Service / Product *
                        <input
                          required
                          value={transitionProposalService}
                          onChange={(event) =>
                            setTransitionProposalService(event.target.value)
                          }
                        />
                      </label>
                      <label>
                        Proposal Amount (₹) *
                        <input
                          required
                          min="0"
                          step="any"
                          type="number"
                          value={transitionProposalAmount}
                          onChange={(event) =>
                            setTransitionProposalAmount(event.target.value)
                          }
                        />
                      </label>
                      <label>
                        Discount (₹)
                        <input
                          min="0"
                          step="any"
                          type="number"
                          value={transitionProposalDiscount}
                          onChange={(event) =>
                            setTransitionProposalDiscount(event.target.value)
                          }
                        />
                      </label>
                      <label>
                        Final Amount (₹)
                        <input
                          readOnly
                          value={
                            transitionProposalAmount
                              ? String(
                                  Number(transitionProposalAmount) -
                                    Number(transitionProposalDiscount || 0),
                                )
                              : ""
                          }
                        />
                      </label>
                      <label className="form-wide">
                        Customer Response
                        <textarea
                          rows={2}
                          value={transitionProposalResponse}
                          onChange={(event) =>
                            setTransitionProposalResponse(event.target.value)
                          }
                        />
                      </label>
                    </div>
                  </section>
                  <section className="lead-form-section form-wide">
                    <div>
                      <h3>Proposal follow-up</h3>
                      <p>Set when the customer should be contacted again</p>
                    </div>
                    <div className="lead-form-fields">
                      <ClockDateTimePicker
                        className="form-wide"
                        label="Follow-up"
                        required
                        value={transitionFollowUpAt}
                        onChange={setTransitionFollowUpAt}
                      />
                    </div>
                  </section>
                </>
              )}
              {stageEditNeedsNegotiation && (
                <>
                  <section className="lead-form-section form-wide">
                    <div>
                      <h3>Negotiation pricing</h3>
                      <p>
                        Compare the proposed price with the customer's
                        expectation
                      </p>
                    </div>
                    <div className="lead-form-fields">
                      <label>
                        Previously Proposed Amount (₹)
                        <input
                          type="number"
                          readOnly
                          required
                          value={transitionOriginalProposalAmount}
                          placeholder={
                            loadingTransitionProposalAmount
                              ? "Loading latest proposal..."
                              : "No proposal amount available"
                          }
                        />
                      </label>
                      <label>
                        Customer Expected Amount (₹) *
                        <input
                          required
                          min="0"
                          step="any"
                          type="number"
                          value={transitionCustomerExpectedAmount}
                          onChange={(event) =>
                            setTransitionCustomerExpectedAmount(
                              event.target.value,
                            )
                          }
                        />
                      </label>
                      <label>
                        Negotiated Amount (₹) *
                        <input
                          required
                          min="0"
                          step="any"
                          type="number"
                          value={transitionNegotiatedAmount}
                          onChange={(event) =>
                            setTransitionNegotiatedAmount(event.target.value)
                          }
                        />
                      </label>
                      <label className="form-wide">
                        Customer Concern
                        <textarea
                          rows={2}
                          value={transitionNegotiationConcern}
                          onChange={(event) =>
                            setTransitionNegotiationConcern(event.target.value)
                          }
                        />
                      </label>
                    </div>
                  </section>
                  <section className="lead-form-section form-wide">
                    <div>
                      <h3>Follow-up plan</h3>
                      <p>Set the next step and when it should happen</p>
                    </div>
                    <div className="lead-form-fields">
                      <label>
                        Next Action *
                        <input
                          required
                          value={transitionNextAction}
                          onChange={(event) =>
                            setTransitionNextAction(event.target.value)
                          }
                        />
                      </label>
                      <ClockDateTimePicker
                        className="form-wide"
                        label="Follow-up"
                        required
                        value={transitionFollowUpAt}
                        onChange={setTransitionFollowUpAt}
                      />
                    </div>
                  </section>
                </>
              )}
              {stageEdit.stage === "WON" && (
                <>
                  <label className="form-wide">
                    Service / project *
                    <input
                      required
                      value={wonService}
                      onChange={(event) => setWonService(event.target.value)}
                    />
                  </label>
                  <label>
                    Final deal value *
                    <input
                      required
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
                      onChange={(event) => setPaymentStatus(event.target.value)}
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
                      onChange={(event) => setWonRemarks(event.target.value)}
                    />
                  </label>
                </>
              )}
              {stageEdit.stage === "LOST" && (
                <>
                  <label className="form-wide">
                    Lost reason *
                    <select
                      required
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
                    <label className="form-wide">
                      Other reason *
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
              <div className="form-footer">
                <p>
                  {stageEditNeedsContact
                    ? "Contact date, contact type, and customer response are required."
                    : stageEditNeedsMeeting
                      ? "Meeting details, next action, and next follow-up are required."
                      : stageEditNeedsProposal
                        ? "Proposal service, amount, date, and follow-up are required."
                        : stageEditNeedsNegotiation
                          ? "Customer expected amount, negotiated amount, next action, and follow-up are required."
                          : "Required details must be provided before changing stage."}
                </p>
                <div>
                  <button
                    className="secondary-action"
                    type="button"
                    disabled={busy}
                    onClick={cancelStageEdit}
                  >
                    Cancel
                  </button>
                  <button className="primary" type="submit" disabled={busy}>
                    {busy
                      ? "Saving..."
                      : stageEditNeedsContact
                        ? stageEdit.stage === "CONTACTED"
                          ? "Save contact and move to Contacted"
                          : "Save qualification and move to Interested"
                        : stageEditNeedsMeeting
                          ? "Schedule meeting and move to Meetings"
                          : stageEditNeedsProposal
                            ? "Create proposal and move to Proposal"
                            : stageEditNeedsNegotiation
                              ? "Save negotiation and move to Negotiation"
                              : `Move to ${stageName(stageEdit.stage)}`}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}

      {showForm && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeLeadForm();
          }}
        >
          <section
            className="lead-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lead-form-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">
                  {editingLeadId ? "UPDATE OPPORTUNITY" : "NEW OPPORTUNITY"}
                </p>
                <h2 id="lead-form-title">
                  {editingLeadId ? "Edit lead" : "Add lead"}
                </h2>
              </div>
              <button
                className="modal-close"
                aria-label="Close"
                onClick={closeLeadForm}
              >
                ×
              </button>
            </div>
            <form onSubmit={saveLead} className="lead-form">
              {!editingLeadId && assignees.length === 0 && (
                <div className="workspace-notice form-wide" role="status">
                  No active BDE is available to assign this lead.
                  {canAssignLeads && isAdmin ? (
                    <>
                      {" "}
                      <Link href="/team">Add or activate a BDE</Link> first.
                    </>
                  ) : (
                    " Ask an administrator to add or activate a BDE."
                  )}
                </div>
              )}
              <section className="lead-form-section form-wide">
                <div>
                  <h3>1. Lead Information</h3>
                  <p>Basic details about the enquiry</p>
                </div>
                <div className="lead-form-fields">
                  <label>
                    Lead ID
                    <input readOnly value="Auto-generated on save" />
                  </label>
                  <label>
                    Lead Date *
                    <input
                      required
                      type="date"
                      value={form.leadDate}
                      onChange={(event) =>
                        setForm({ ...form, leadDate: event.target.value })
                      }
                    />
                  </label>
                </div>
              </section>
              <section className="lead-form-section form-wide">
                <div>
                  <h3>2. Customer Details</h3>
                  <p>Contact and business information</p>
                </div>
                <div className="lead-form-fields">
                  <label>
                    Customer Name *
                    <input
                      required
                      value={form.customerName}
                      onChange={(event) =>
                        setForm({ ...form, customerName: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Business / Company Name
                    <input
                      value={form.businessName}
                      onChange={(event) =>
                        setForm({ ...form, businessName: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Mobile Number *
                    <input
                      required
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      pattern="[0-9]{10}"
                      title="Enter a 10-digit mobile number."
                      value={form.mobileNumber}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          mobileNumber: event.target.value
                            .replace(/\D/g, "")
                            .slice(0, 10),
                        })
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
                  <label className="form-wide">
                    Location
                    <input
                      value={form.location}
                      onChange={(event) =>
                        setForm({ ...form, location: event.target.value })
                      }
                    />
                  </label>
                </div>
              </section>
              {editingLeadId && (
                <section className="lead-form-section form-wide">
                  <div>
                    <h3>3. Business Requirements</h3>
                    <p>What the prospect needs</p>
                  </div>
                  <div className="lead-form-fields">
                    <label>
                      Business Category
                      <input
                        value={form.businessCategory}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            businessCategory: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Estimated Budget
                      <input
                        min="0"
                        type="number"
                        value={form.estimatedBudget}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            estimatedBudget: event.target.value,
                          })
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
                  </div>
                </section>
              )}
              <section className="lead-form-section form-wide">
                <div>
                  <h3>{editingLeadId ? "4." : "3."} Lead Classification</h3>
                  <p>Source, urgency and ownership</p>
                </div>
                <div className="lead-form-fields">
                  <label>
                    Lead Source *
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
                    Lead Priority
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
                  <label className="form-wide">
                    Assigned BDE {!editingLeadId && "*"}
                    <select
                      required={!editingLeadId}
                      disabled={Boolean(editingLeadId) && !canAssignLeads}
                      value={form.assignedBdeId}
                      onChange={(event) =>
                        setForm({ ...form, assignedBdeId: event.target.value })
                      }
                    >
                      <option value="">Select owner</option>
                      {editingLeadId &&
                        originalAssignedBdeId &&
                        !assignees.some(
                          (user) => user.id === originalAssignedBdeId,
                        ) && (
                          <option value={originalAssignedBdeId}>
                            {originalAssignedBdeName}
                          </option>
                        )}
                      {assignees.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.fullName}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>
              <section className="lead-form-section form-wide">
                <div>
                  <h3>
                    {editingLeadId ? "5." : "4."} Follow-up &amp; Sales Pipeline
                  </h3>
                  <p>Track progress and the next interaction</p>
                </div>
                <div className="lead-form-fields">
                  <label>
                    Current Stage {editingLeadId ? "" : "*"}
                    <select
                      required={!editingLeadId}
                      disabled={Boolean(editingLeadId)}
                      value={form.stage}
                      onChange={(event) =>
                        setForm({ ...form, stage: event.target.value as Stage })
                      }
                    >
                      {STAGES.map((stage) => (
                        <option key={stage} value={stage}>
                          {stageName(stage)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Next Action / Contact Via{" "}
                    {(!editingLeadId || !isTerminalStage(form.stage)) && "*"}
                    <select
                      required={
                        !editingLeadId || !isTerminalStage(form.stage)
                      }
                      value={form.nextAction}
                      onChange={(event) =>
                        setForm({ ...form, nextAction: event.target.value })
                      }
                    >
                      <option value="">Select contact method</option>
                      {editingLeadId &&
                        form.nextAction &&
                        !CONTACT_TYPES.includes(
                          form.nextAction as (typeof CONTACT_TYPES)[number],
                        ) && (
                          <option value={form.nextAction}>
                            {form.nextAction}
                          </option>
                        )}
                      {CONTACT_TYPES.filter(
                        (contactType) => contactType !== "Other",
                      ).map((contactType) => (
                        <option key={contactType} value={contactType}>
                          {contactType}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-wide">
                    Follow-up Date{" "}
                    {(!editingLeadId || !isTerminalStage(form.stage)) && "*"}
                    <input
                      required={
                        !editingLeadId || !isTerminalStage(form.stage)
                      }
                      type="date"
                      value={form.followUpAt}
                      onChange={(event) =>
                        setForm({ ...form, followUpAt: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Remarks
                    <textarea
                      rows={2}
                      value={form.remarks}
                      onChange={(event) =>
                        setForm({ ...form, remarks: event.target.value })
                      }
                    />
                  </label>
                  {form.stage === "WON" && (
                    <>
                      <label>
                        Service / Project *
                        <input
                          required
                          value={form.wonService}
                          onChange={(event) =>
                            setForm({ ...form, wonService: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Final Deal Value *
                        <input
                          required
                          min="0"
                          type="number"
                          value={form.finalDealValue}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              finalDealValue: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Payment Status
                        <select
                          value={form.paymentStatus}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              paymentStatus: event.target.value,
                            })
                          }
                        >
                          {PAYMENT_STATUSES.map((status) => (
                            <option key={status}>{status}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Expected Start Date
                        <input
                          type="date"
                          value={form.expectedStartDate}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              expectedStartDate: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="form-wide">
                        Deal Remarks
                        <textarea
                          rows={2}
                          value={form.wonRemarks}
                          onChange={(event) =>
                            setForm({ ...form, wonRemarks: event.target.value })
                          }
                        />
                      </label>
                    </>
                  )}
                  {form.stage === "LOST" && (
                    <>
                      <label>
                        Lost Reason *
                        <select
                          required
                          value={form.lostReason}
                          onChange={(event) =>
                            setForm({ ...form, lostReason: event.target.value })
                          }
                        >
                          {LOST_REASONS.map((reason) => (
                            <option key={reason}>{reason}</option>
                          ))}
                        </select>
                      </label>
                      {form.lostReason === "Other" && (
                        <label>
                          Other Reason *
                          <input
                            required
                            value={form.otherLostReason}
                            onChange={(event) =>
                              setForm({
                                ...form,
                                otherLostReason: event.target.value,
                              })
                            }
                          />
                        </label>
                      )}
                    </>
                  )}
                </div>
              </section>
              <div className="form-footer">
                <p>
                  {editingLeadId
                    ? "Lead ID and stage are not changed here."
                    : "Lead ID is generated automatically when saved."}
                </p>
                <button
                  className="primary"
                  disabled={busy || (!editingLeadId && assignees.length === 0)}
                >
                  {busy
                    ? "Saving..."
                    : editingLeadId
                      ? "Save changes"
                      : "Create lead"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
