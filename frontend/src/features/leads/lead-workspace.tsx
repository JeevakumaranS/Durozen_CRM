"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { apiClient } from "../../lib/api-client";
import { LEAD_UPDATED_EVENT } from "../../lib/lead-events";
import { getAuthUser } from "../../lib/auth";
import { notify } from "../../lib/notifications";
import { ClockDateTimePicker } from "../../components/shared/clock-date-time-picker";
import { CallCompletionFields } from "../calls/call-completion-fields";
import { MeetingCompletionFields } from "../meetings/meeting-completion-fields";
import { ProposalCompletionFields } from "../proposals/proposal-completion-fields";
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
const WON_RESPONSE_PAYMENT_STATUSES = [
  "Advance Payment",
  "Fully Paid",
  "Not Paid",
] as const;

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
  finalDealValue?: string | number | null;
  proposals?: { finalAmount?: string | number | null }[];
  negotiations?: { negotiatedAmount?: string | number | null }[];
  priority: Priority;
  stage: Stage;
  nextAction?: string | null;
  followUpAt?: string | null;
  remarks?: string | null;
  createdAt: string;
  assignedBde: { id: string; fullName: string };
};
type ScheduledMeeting = {
  id: string;
  requirement?: string | null;
  budget?: string | number | null;
  discussionNotes?: string | null;
};
type PendingProposalFollowUp = { id: string };
type PendingNegotiationFollowUp = {
  id: string;
  negotiation?: {
    originalProposalAmount?: string | number | null;
    customerExpectedAmount?: string | number | null;
    negotiatedAmount?: string | number | null;
  } | null;
  lead: { id: string; customerName: string };
};
type PendingNegotiationOutcome = {
  id: string;
  responseSavedAt?: string | null;
  lead: { id: string; stage: Stage };
};
type LeadEditRecord = Omit<Lead, "createdAt"> & {
  email?: string | null;
  location?: string | null;
  leadSource: string;
  finalDealValue?: string | number | null;
  wonService?: string | null;
  paymentStatus?: string | null;
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
    requirement: "",
    estimatedBudget: "",
    leadSource: "Website",
    priority: "WARM",
    assignedBdeId: "",
    stage: "NEW_LEAD",
    nextAction: "",
    followUpAt: localDateInputValue(),
    remarks: "",
    finalDealValue: "",
    wonService: "",
    paymentStatus: PAYMENT_STATUSES[0],
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

function isBackwardStageMove(currentStage: Stage, targetStage: Stage) {
  if (isTerminalStage(targetStage)) return false;
  return STAGES.indexOf(targetStage) < STAGES.indexOf(currentStage);
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
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
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
  const userRole = getAuthUser()?.role;
  const isAdmin = userRole === "ADMIN";
  const canCreateLeads = userRole === "ADMIN" || userRole === "BDE";
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
  const [callResponseAction, setCallResponseAction] = useState("");
  const [scheduleContactMeeting, setScheduleContactMeeting] = useState<
    boolean | null
  >(null);
  const [interestedTransitionAction, setInterestedTransitionAction] = useState<
    "" | "INTERESTED" | "LOST"
  >("");
  const [interestedMeetingType, setInterestedMeetingType] = useState("");
  const [transitionFollowUpAt, setTransitionFollowUpAt] = useState("");
  const [transitionNextAction, setTransitionNextAction] = useState("");
  const [transitionMeetingAt, setTransitionMeetingAt] = useState("");
  const [scheduledMeeting, setScheduledMeeting] =
    useState<ScheduledMeeting | null>(null);
  const [loadingScheduledMeeting, setLoadingScheduledMeeting] = useState(false);
  const [scheduledMeetingCheckError, setScheduledMeetingCheckError] =
    useState("");
  const [completionRequirement, setCompletionRequirement] = useState("");
  const [completionBudget, setCompletionBudget] = useState("");
  const [completionDiscussionNotes, setCompletionDiscussionNotes] =
    useState("");
  const [completionNextAction, setCompletionNextAction] = useState("");
  const [completionFollowUpAt, setCompletionFollowUpAt] = useState("");
  const [completionLostReason, setCompletionLostReason] = useState(
    LOST_REASONS[0],
  );
  const [completionOtherLostReason, setCompletionOtherLostReason] =
    useState("");
  const [transitionMeetingType, setTransitionMeetingType] = useState<
    (typeof MEETING_TYPES)[number]
  >("Requirement Discussion");
  const [transitionDiscussionNotes, setTransitionDiscussionNotes] =
    useState("");
  const [transitionCustomerConcerns, setTransitionCustomerConcerns] =
    useState("");
  const [transitionProposalDate, setTransitionProposalDate] = useState(
    localDateInputValue(),
  );
  const [pendingProposalFollowUp, setPendingProposalFollowUp] =
    useState<PendingProposalFollowUp | null>(null);
  const [loadingPendingProposalFollowUp, setLoadingPendingProposalFollowUp] =
    useState(false);
  const [pendingProposalCheckError, setPendingProposalCheckError] =
    useState("");
  const [pendingNegotiationFollowUp, setPendingNegotiationFollowUp] =
    useState<PendingNegotiationFollowUp | null>(null);
  const [loadingPendingNegotiationFollowUp, setLoadingPendingNegotiationFollowUp] =
    useState(false);
  const [pendingNegotiationCheckError, setPendingNegotiationCheckError] =
    useState("");
  const [pendingNegotiationOutcome, setPendingNegotiationOutcome] =
    useState<PendingNegotiationOutcome | null>(null);
  const [negotiatedAmount, setNegotiatedAmount] = useState("");
  const [pendingProposalFollowUpDate, setPendingProposalFollowUpDate] =
    useState(localDateInputValue());
  const [transitionProposalService, setTransitionProposalService] =
    useState("");
  const [transitionProposalAmount, setTransitionProposalAmount] = useState("");
  const [transitionProposalDiscount, setTransitionProposalDiscount] =
    useState("");
  const [transitionProposalResponse, setTransitionProposalResponse] =
    useState("");
  const [transitionProposalId, setTransitionProposalId] = useState("");
  const [transitionOriginalProposalAmount, setTransitionOriginalProposalAmount] =
    useState("");
  const [loadingTransitionProposalAmount, setLoadingTransitionProposalAmount] =
    useState(false);
  const [transitionCustomerExpectedAmount, setTransitionCustomerExpectedAmount] =
    useState("");
  const [transitionWonExpectedTimeline, setTransitionWonExpectedTimeline] =
    useState("");
  const [transitionWonPaymentStatus, setTransitionWonPaymentStatus] = useState<
    "" | (typeof WON_RESPONSE_PAYMENT_STATUSES)[number]
  >("");
  const [transitionWonAdvanceAmount, setTransitionWonAdvanceAmount] =
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
          assignedBdeId: isAdmin ? "" : (assignees[0]?.id ?? ""),
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
          requirement: form.requirement || undefined,
          leadSource: form.leadSource,
          priority: form.priority,
          assignedBdeId: form.assignedBdeId,
          stage: "NEW_LEAD",
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
        assignedBdeId: isAdmin ? "" : (assignees[0]?.id ?? ""),
      });
      setShowForm(false);
      setOriginalAssignedBdeId("");
      setOriginalAssignedBdeName("");
      notify("Lead created in New Lead stage.");
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
      assignedBdeId: isAdmin ? "" : (assignees[0]?.id ?? ""),
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

  async function saveStage(lead: Lead, requestedStage = stageEdit?.stage) {
    let targetStage = requestedStage;
    if (!targetStage) return;
    const requiresInterestedChoice =
      lead.stage === "CONTACTED" && targetStage === "INTERESTED";
    if (
      requiresInterestedChoice &&
      interestedTransitionAction === "LOST"
    ) {
      targetStage = "LOST";
    }
    let createdProposal = false;
    let createdNegotiation = false;
    const requiresMeeting =
      lead.stage === "INTERESTED" && targetStage === "MEETING";
    const requiresProposal =
      lead.stage === "MEETING" && targetStage === "PROPOSAL";
    const requiresNegotiation =
      lead.stage === "PROPOSAL" && targetStage === "NEGOTIATION";
    const requiresProposalOutcome =
      lead.stage === "PROPOSAL" &&
      ["NEGOTIATION", "WON", "LOST"].includes(targetStage);
    const completingNegotiationFollowUp =
      lead.stage === "NEGOTIATION" && targetStage === "WON";
    const savingNegotiationOutcome =
      completingNegotiationFollowUp &&
      !pendingNegotiationFollowUp &&
      pendingNegotiationOutcome !== null;
    const requiresInitialCall =
      lead.stage === "NEW_LEAD" && targetStage === "CONTACTED";
    const completingScheduledMeeting =
      requiresMeeting && scheduledMeeting !== null;
    const completingPendingProposal =
      requiresProposal && pendingProposalFollowUp !== null;
    if (requiresMeeting && (loadingScheduledMeeting || scheduledMeetingCheckError)) {
      const message =
        scheduledMeetingCheckError ||
        "Checking for an already scheduled meeting.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    const requiresContactDetails = requiresInitialCall;
    const requiresFollowUpPlan =
      lead.stage === "CONTACTED" && targetStage === "INTERESTED";
    const lostReason =
      lostReasonType === "Other" ? otherLostReason.trim() : lostReasonType;
    if (requiresInterestedChoice && !interestedTransitionAction) {
      const message = "Choose Interested or Lost as the next action.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (
      requiresInterestedChoice &&
      interestedTransitionAction === "LOST" &&
      (!lostReason.trim() ||
        (lostReasonType === "Other" && !otherLostReason.trim()))
    ) {
      const message = "Choose or enter a lost reason.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (requiresInitialCall && !callResponseAction) {
      const message = "Select the customer's response before completing the call.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (
      requiresInitialCall &&
      callResponseAction === "Not Interested" &&
      (!lostReason.trim() ||
        (lostReasonType === "Other" && !otherLostReason.trim()))
    ) {
      const message = "Enter a lost reason before completing the call.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (
      requiresInitialCall &&
      callResponseAction === "Interested" &&
      scheduleContactMeeting === null
    ) {
      const message = "Choose whether to schedule a meeting.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (
      requiresInitialCall &&
      scheduleContactMeeting &&
      (!transitionMeetingAt || !transitionMeetingType)
    ) {
      const message = "Enter the meeting date, time, and type.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (requiresContactDetails && !contactDate) {
      const message = "Enter the contact date before changing stage.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (
      requiresContactDetails &&
      (!requiresInitialCall || callResponseAction !== "Not Interested") &&
      !customerResponse.trim()
    ) {
      const message = "Enter the customer's response before changing stage.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (
      requiresInitialCall &&
      callResponseAction !== "Not Interested" &&
      !contactRequirement.trim()
    ) {
      const message = "Enter the customer's requirements before completing the call.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (
      requiresFollowUpPlan &&
      (!transitionMeetingAt || !interestedMeetingType)
    ) {
      const message = "Enter the meeting date, time, and type.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (requiresMeeting && !completingScheduledMeeting && !transitionMeetingAt) {
      const message =
        "Enter the meeting date and time before moving to Meetings.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (requiresMeeting && !completingScheduledMeeting && !transitionNextAction.trim()) {
      const message = "Enter the next action before moving to Meetings.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (requiresMeeting && !completingScheduledMeeting && !transitionFollowUpAt) {
      const message =
        "Enter the next follow-up date before moving to Meetings.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (completingScheduledMeeting && !completionRequirement.trim()) {
      const message = "Enter the meeting requirement.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (
      completingScheduledMeeting &&
      !["Proposal", "Lost"].includes(completionNextAction)
    ) {
      const message = "Choose the meeting's next action.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (
      completingScheduledMeeting &&
      completionNextAction === "Proposal" &&
      (!completionFollowUpAt ||
        new Date(businessDateTimeToIso(completionFollowUpAt)).getTime() <=
          Date.now())
    ) {
      const message = "Choose a future next follow-up date.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (
      completingScheduledMeeting &&
      completionNextAction === "Lost" &&
      (completionLostReason === "Other"
        ? !completionOtherLostReason.trim()
        : !completionLostReason)
    ) {
      const message = "Choose or enter a lost reason.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (
      requiresProposal &&
      (loadingPendingProposalFollowUp || pendingProposalCheckError)
    ) {
      const message =
        pendingProposalCheckError ||
        "Checking for a pending proposal follow-up.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (
      requiresProposal &&
      !transitionProposalService.trim()
    ) {
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
    if (requiresProposal && !completingPendingProposal && !transitionProposalDate) {
      const message = "Enter the proposal date before moving to Proposal.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (
      requiresProposal &&
      (completingPendingProposal
        ? !pendingProposalFollowUpDate
        : !transitionFollowUpAt)
    ) {
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
    if (requiresNegotiation && !transitionProposalResponse.trim()) {
      const message = "Enter the customer's response before moving to Negotiation.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (
      completingNegotiationFollowUp &&
      (loadingPendingNegotiationFollowUp || pendingNegotiationCheckError)
    ) {
      const message =
        pendingNegotiationCheckError ||
        "Checking for a pending negotiation follow-up.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (
      completingNegotiationFollowUp &&
      !pendingNegotiationFollowUp &&
      !pendingNegotiationOutcome
    ) {
      const message =
        pendingNegotiationCheckError ||
        "No pending negotiation follow-up or outcome was found for this lead.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (
      completingNegotiationFollowUp &&
      pendingNegotiationFollowUp &&
      (!negotiatedAmount ||
        !Number.isFinite(Number(negotiatedAmount)) ||
        Number(negotiatedAmount) < 0)
    ) {
      const message = "Enter a valid negotiated amount.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (
      savingNegotiationOutcome &&
      (!transitionWonExpectedTimeline.trim() ||
        !transitionWonPaymentStatus ||
        (transitionWonPaymentStatus === "Advance Payment" &&
          (!transitionWonAdvanceAmount ||
            !Number.isFinite(Number(transitionWonAdvanceAmount)) ||
            Number(transitionWonAdvanceAmount) <= 0)))
    ) {
      const message =
        "Enter the expected timeline and required payment details for a Won outcome.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (requiresProposalOutcome && !transitionProposalId) {
      const message = "Unable to load the latest proposal.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (
      stageEditNeedsWonFromProposal &&
      (!transitionWonExpectedTimeline.trim() ||
        !transitionWonPaymentStatus ||
        (transitionWonPaymentStatus === "Advance Payment" &&
          (!transitionWonAdvanceAmount ||
            !Number.isFinite(Number(transitionWonAdvanceAmount)) ||
            Number(transitionWonAdvanceAmount) <= 0 ||
            Number(transitionWonAdvanceAmount) > Number(finalDealValue))))
    ) {
      const message =
        "Enter the expected timeline and valid payment details for a Won outcome.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (
      targetStage === "WON" &&
      !completingNegotiationFollowUp &&
      !finalDealValue.trim()
    ) {
      const message =
        "Enter a final deal value before marking this lead as won.";
      setStageFormError(message);
      notify(message, "error");
      return;
    }
    if (
      targetStage === "WON" &&
      !completingNegotiationFollowUp &&
      !wonService.trim()
    ) {
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
    let completedCallStage: Stage | null = null;
    let completedMeetingStage: Stage | null = null;
    let completedNegotiationFollowUp = false;
    let completedNegotiationOutcome = false;
    try {
      if (requiresInitialCall) {
        const nextStage =
          callResponseAction === "Not Interested"
            ? "LOST"
            : callResponseAction === "Interested"
              ? "INTERESTED"
              : "CONTACTED";
        await apiClient("/calls-messages/complete-lead", {
          method: "POST",
          body: JSON.stringify({
            leadId: lead.id,
            contactMethod: contactType,
            contactDate: new Date(
              `${contactDate}T00:00:00.000Z`,
            ).toISOString(),
            responseAction: callResponseAction,
            customerResponse:
              callResponseAction === "Not Interested"
                ? undefined
                : customerResponse.trim(),
            requirement:
              callResponseAction === "Not Interested"
                ? undefined
                : contactRequirement.trim(),
            lostReason:
              callResponseAction === "Not Interested" ? lostReason : undefined,
            remarks: contactRemarks.trim() || undefined,
            scheduleMeeting:
              callResponseAction === "Interested"
                ? scheduleContactMeeting
                : undefined,
            meetingAt:
              scheduleContactMeeting && transitionMeetingAt
                ? businessDateTimeToIso(transitionMeetingAt)
                : undefined,
            meetingType:
              scheduleContactMeeting ? transitionMeetingType : undefined,
          }),
        });
        completedCallStage = nextStage;
      } else if (completingScheduledMeeting && scheduledMeeting) {
        const lostReason =
          completionLostReason === "Other"
            ? completionOtherLostReason.trim()
            : completionLostReason;
        await apiClient(`/meetings/${scheduledMeeting.id}/complete`, {
          method: "PATCH",
          body: JSON.stringify({
            requirement: completionRequirement.trim(),
            budget: completionBudget ? Number(completionBudget) : null,
            discussionNotes: completionDiscussionNotes.trim() || undefined,
            nextAction: completionNextAction,
            followUpAt:
              completionNextAction === "Proposal"
                ? businessDateTimeToIso(completionFollowUpAt)
                : undefined,
            lostReason:
              completionNextAction === "Lost" ? lostReason : undefined,
          }),
        });
        completedMeetingStage =
          completionNextAction === "Lost" ? "LOST" : "MEETING";
      } else if (requiresMeeting) {
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
      } else if (requiresProposal && completingPendingProposal) {
        await apiClient(`/follow-ups/${pendingProposalFollowUp.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "COMPLETED",
            nextStage: "PROPOSAL",
            proposalDate: new Date(
              `${localDateInputValue()}T00:00:00`,
            ).toISOString(),
            serviceProduct: transitionProposalService.trim(),
            proposalAmount: Number(transitionProposalAmount),
            discount: transitionProposalDiscount
              ? Number(transitionProposalDiscount)
              : 0,
            dueAt: businessDateTimeToIso(
              `${pendingProposalFollowUpDate}T00:00`,
            ),
            nextAction: "Follow up on proposal",
          }),
        });
        createdProposal = true;
      } else if (requiresProposal) {
        await apiClient("/proposals", {
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
        });
        createdProposal = true;
      } else if (requiresProposalOutcome) {
        await apiClient(`/proposals/${transitionProposalId}`, {
          method: "PATCH",
          body: JSON.stringify({
            nextAction:
              targetStage === "NEGOTIATION"
                ? "Negotiation"
                : targetStage === "WON"
                  ? "Won"
                  : "Lost",
            ...(targetStage === "NEGOTIATION"
              ? {
                  customerResponse: transitionProposalResponse.trim(),
                  customerExpectedAmount: Number(
                    transitionCustomerExpectedAmount,
                  ),
                }
              : {}),
            ...(targetStage === "WON"
              ? {
                  expectedTimeline: transitionWonExpectedTimeline.trim(),
                  paymentStatus: transitionWonPaymentStatus,
                  ...(transitionWonPaymentStatus === "Advance Payment"
                    ? {
                        advanceAmount: Number(transitionWonAdvanceAmount),
                      }
                    : {}),
                }
              : {}),
            ...(targetStage === "LOST"
              ? {
                  lostReason:
                    lostReasonType === "Other"
                      ? otherLostReason.trim()
                      : lostReasonType,
                }
              : {}),
          }),
        });
        createdNegotiation = targetStage === "NEGOTIATION";
      } else if (completingNegotiationFollowUp && pendingNegotiationFollowUp) {
        await apiClient(`/follow-ups/${pendingNegotiationFollowUp.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "COMPLETED",
            nextStage: "NEGOTIATION",
            negotiatedAmount: Number(negotiatedAmount),
          }),
        });
        completedNegotiationFollowUp = true;
      } else if (savingNegotiationOutcome && pendingNegotiationOutcome) {
        await apiClient(`/negotiations/${pendingNegotiationOutcome.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            nextAction: "Won",
            expectedTimeline: transitionWonExpectedTimeline.trim(),
            paymentStatus: transitionWonPaymentStatus,
            ...(transitionWonPaymentStatus === "Advance Payment"
              ? { advanceAmount: Number(transitionWonAdvanceAmount) }
              : {}),
          }),
        });
        completedNegotiationOutcome = true;
      } else {
        await apiClient<Lead>(`/leads/${lead.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            stage: targetStage,
            nextAction: requiresFollowUpPlan
              ? "Attend scheduled meeting"
              : lead.nextAction,
            followUpAt: requiresFollowUpPlan
              ? businessDateTimeToIso(transitionMeetingAt)
              : lead.followUpAt,
            ...(requiresFollowUpPlan
              ? {
                  scheduleMeeting: true,
                  meetingAt: businessDateTimeToIso(transitionMeetingAt),
                  meetingType: interestedMeetingType,
                }
              : {}),
            finalDealValue:
              targetStage === "WON" ? Number(finalDealValue) : undefined,
            wonService: targetStage === "WON" ? wonService : undefined,
            paymentStatus: targetStage === "WON" ? paymentStatus : undefined,
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
      const destinationStage =
        completedCallStage ??
        completedMeetingStage ??
        (completedNegotiationFollowUp ? "NEGOTIATION" : targetStage);
      movedLeadToTopByStage.current = {
        ...movedLeadToTopByStage.current,
        [destinationStage]: lead.id,
      };
      setStagePages((current) => ({ ...current, [destinationStage]: 1 }));
      setStageEdit(null);
      setFinalDealValue("");
      setWonService("");
      setPaymentStatus(PAYMENT_STATUSES[0]);
      setLostReasonType(LOST_REASONS[0]);
      setOtherLostReason("");
      setContactDate(localDateInputValue());
      setContactType("Phone Call");
      setCustomerResponse("");
      setContactRequirement("");
      setContactBudget("");
      setExpectedTimeline("");
      setContactRemarks("");
      setCallResponseAction("");
      setScheduleContactMeeting(null);
      setInterestedTransitionAction("");
      setInterestedMeetingType("");
      setScheduledMeeting(null);
      setCompletionRequirement("");
      setCompletionBudget("");
      setCompletionDiscussionNotes("");
      setCompletionNextAction("");
      setCompletionFollowUpAt("");
      setCompletionLostReason(LOST_REASONS[0]);
      setCompletionOtherLostReason("");
      setTransitionFollowUpAt("");
      setTransitionNextAction("");
      setTransitionMeetingAt("");
      setTransitionMeetingType("Requirement Discussion");
      setTransitionDiscussionNotes("");
      setTransitionCustomerConcerns("");
      setTransitionProposalDate(localDateInputValue());
      setPendingProposalFollowUp(null);
      setLoadingPendingProposalFollowUp(false);
      setPendingProposalCheckError("");
      setPendingProposalFollowUpDate(localDateInputValue());
      setTransitionProposalService("");
      setTransitionProposalAmount("");
      setTransitionProposalDiscount("");
      setTransitionProposalResponse("");
      setTransitionProposalId("");
      setTransitionOriginalProposalAmount("");
      setLoadingTransitionProposalAmount(false);
      setTransitionCustomerExpectedAmount("");
      setTransitionWonExpectedTimeline("");
      setTransitionWonPaymentStatus("");
      setTransitionWonAdvanceAmount("");
      setPendingNegotiationFollowUp(null);
      setPendingNegotiationOutcome(null);
      setLoadingPendingNegotiationFollowUp(false);
      setPendingNegotiationCheckError("");
      setNegotiatedAmount("");
      notify(
        createdProposal
          ? `Proposal ${lead.leadNumber} created and lead moved to Proposal.`
          : createdNegotiation
            ? "Negotiation saved and lead moved to Negotiation."
            : completedMeetingStage === "LOST"
              ? "Meeting completed and lead moved to Lost."
              : completedMeetingStage === "MEETING"
                ? "Meeting completed and proposal follow-up added."
                : completedNegotiationFollowUp
                  ? "Negotiation follow-up completed. Lead remains in Negotiation."
                  : completedNegotiationOutcome
                    ? "Negotiation outcome saved. Lead moved to Won."
                  : `Lead moved to ${stageName(destinationStage)}.`,
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
    setLostReasonType(LOST_REASONS[0]);
    setOtherLostReason("");
    setContactDate(localDateInputValue());
    setContactType("Phone Call");
    setCustomerResponse("");
    setContactRequirement("");
    setContactBudget("");
    setExpectedTimeline("");
    setContactRemarks("");
    setCallResponseAction("");
    setScheduleContactMeeting(null);
    setInterestedTransitionAction("");
    setInterestedMeetingType("");
    setTransitionFollowUpAt("");
    setTransitionNextAction("");
    setTransitionMeetingAt("");
    setScheduledMeeting(null);
    setLoadingScheduledMeeting(false);
    setScheduledMeetingCheckError("");
    setCompletionRequirement("");
    setCompletionBudget("");
    setCompletionDiscussionNotes("");
    setCompletionNextAction("");
    setCompletionFollowUpAt("");
    setCompletionLostReason(LOST_REASONS[0]);
    setCompletionOtherLostReason("");
    setTransitionMeetingType("Requirement Discussion");
    setTransitionDiscussionNotes("");
    setTransitionCustomerConcerns("");
    setTransitionProposalDate(localDateInputValue());
    setPendingProposalFollowUp(null);
    setLoadingPendingProposalFollowUp(false);
    setPendingProposalCheckError("");
    setPendingProposalFollowUpDate(localDateInputValue());
    setTransitionProposalService("");
    setTransitionProposalAmount("");
    setTransitionProposalDiscount("");
    setTransitionProposalResponse("");
    setTransitionProposalId("");
    setTransitionOriginalProposalAmount("");
    setLoadingTransitionProposalAmount(false);
    setTransitionCustomerExpectedAmount("");
    setTransitionWonExpectedTimeline("");
    setTransitionWonPaymentStatus("");
    setTransitionWonAdvanceAmount("");
    setPendingNegotiationFollowUp(null);
    setPendingNegotiationOutcome(null);
    setLoadingPendingNegotiationFollowUp(false);
    setPendingNegotiationCheckError("");
    setNegotiatedAmount("");
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
    setCallResponseAction("");
    setScheduleContactMeeting(null);
    setInterestedTransitionAction("");
    setInterestedMeetingType("");
    if (lead.stage === "CONTACTED" && targetStage === "INTERESTED") {
      setLostReasonType("");
      setOtherLostReason("");
    }
    setScheduledMeeting(null);
    setLoadingScheduledMeeting(
      lead.stage === "INTERESTED" && targetStage === "MEETING",
    );
    setScheduledMeetingCheckError("");
    setCompletionRequirement("");
    setCompletionBudget("");
    setCompletionDiscussionNotes("");
    setCompletionNextAction("");
    setCompletionFollowUpAt("");
    setCompletionLostReason(LOST_REASONS[0]);
    setCompletionOtherLostReason("");
    setTransitionFollowUpAt(localDateTimeInputValue(lead.followUpAt));
    setTransitionNextAction(lead.nextAction ?? "");
    setTransitionMeetingAt("");
    setTransitionMeetingType("Requirement Discussion");
    setTransitionDiscussionNotes("");
    setTransitionCustomerConcerns("");
    setTransitionProposalDate(localDateInputValue());
    setPendingProposalFollowUp(null);
    setLoadingPendingProposalFollowUp(
      lead.stage === "MEETING" && targetStage === "PROPOSAL",
    );
    setPendingProposalCheckError("");
    setPendingProposalFollowUpDate(localDateInputValue());
    setTransitionProposalService("");
    setTransitionProposalAmount("");
    setTransitionProposalDiscount("");
    setTransitionProposalResponse("");
    setTransitionProposalId("");
    setTransitionOriginalProposalAmount("");
    setLoadingTransitionProposalAmount(
      lead.stage === "PROPOSAL" &&
        ["NEGOTIATION", "WON", "LOST"].includes(targetStage),
    );
    setTransitionCustomerExpectedAmount("");
    setTransitionWonExpectedTimeline("");
    setTransitionWonPaymentStatus("");
    setTransitionWonAdvanceAmount("");
    setPendingNegotiationFollowUp(null);
    setPendingNegotiationOutcome(null);
    setLoadingPendingNegotiationFollowUp(
      lead.stage === "NEGOTIATION" && targetStage === "WON",
    );
    setPendingNegotiationCheckError("");
    setNegotiatedAmount("");
    setStageEdit({ leadId: lead.id, stage: targetStage });
  }

  function handleLeadDrop(lead: Lead, targetStage: Stage) {
    setDropTargetStage(null);
    setDraggingLeadId(null);
    if (lead.stage === targetStage) return;
    if (isBackwardStageMove(lead.stage, targetStage)) {
      notify("Leads cannot be moved to an earlier stage in the kanban.", "error");
      return;
    }
    if (isTerminalStage(lead.stage)) {
      notify("Won and lost leads cannot be moved to another stage.", "error");
      return;
    }

    beginStageEdit(lead, targetStage);
    if (
      isTerminalStage(targetStage) ||
      (lead.stage === "PROPOSAL" && targetStage === "NEGOTIATION")
    )
      return;
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
  const stageEditNeedsInitialCall =
    stageEditLead?.stage === "NEW_LEAD" && stageEdit?.stage === "CONTACTED";
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
  const stageEditNeedsLostFromProposal =
    stageEditLead?.stage === "PROPOSAL" && stageEdit?.stage === "LOST";
  const stageEditNeedsNegotiationCompletion =
    Boolean(
      stageEditLead?.stage === "NEGOTIATION" && stageEdit?.stage === "WON",
    );
  const stageEditNeedsNegotiationOutcome =
    Boolean(
      stageEditNeedsNegotiationCompletion &&
        !pendingNegotiationFollowUp &&
        pendingNegotiationOutcome,
    );
  const stageEditNeedsProposalOutcome =
    stageEditNeedsNegotiation ||
    stageEditNeedsWonFromProposal ||
    stageEditNeedsLostFromProposal;
  const stageEditNeedsModal =
    stageEdit !== null &&
    (isTerminalStage(stageEdit.stage) ||
      stageEditNeedsContact ||
      stageEditNeedsMeeting ||
      stageEditNeedsProposal ||
      stageEditNeedsNegotiation);

  useEffect(() => {
    if (!stageEditNeedsMeeting || !stageEdit?.leadId) return;
    let active = true;
    setLoadingScheduledMeeting(true);
    setScheduledMeetingCheckError("");
    apiClient<ScheduledMeeting | null>(
      `/meetings/lead/${stageEdit.leadId}/scheduled`,
    )
      .then((meeting) => {
        if (!active) return;
        setScheduledMeeting(meeting);
        if (meeting) {
          setCompletionRequirement(meeting.requirement ?? "");
          setCompletionBudget(
            meeting.budget === null || meeting.budget === undefined
              ? ""
              : String(meeting.budget),
          );
          setCompletionDiscussionNotes(meeting.discussionNotes ?? "");
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message =
          error instanceof Error
            ? error.message
            : "Unable to check for a scheduled meeting.";
        setScheduledMeetingCheckError(message);
        setStageFormError(message);
      })
      .finally(() => {
        if (active) setLoadingScheduledMeeting(false);
      });
    return () => {
      active = false;
    };
  }, [stageEditNeedsMeeting, stageEdit?.leadId]);

  useEffect(() => {
    if (!stageEditNeedsProposal || !stageEdit?.leadId) return;
    let active = true;
    setLoadingPendingProposalFollowUp(true);
    setPendingProposalCheckError("");
    apiClient<PendingProposalFollowUp | null>(
      `/follow-ups/lead/${stageEdit.leadId}/pending-proposal`,
    )
      .then((followUp) => {
        if (active) setPendingProposalFollowUp(followUp);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message =
          error instanceof Error
            ? error.message
            : "Unable to check for a pending proposal follow-up.";
        setPendingProposalCheckError(message);
        setStageFormError(message);
      })
      .finally(() => {
        if (active) setLoadingPendingProposalFollowUp(false);
      });
    return () => {
      active = false;
    };
  }, [stageEditNeedsProposal, stageEdit?.leadId]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!stageEditNeedsProposalOutcome || !stageEdit?.leadId)
      return;
    let active = true;
    setTransitionOriginalProposalAmount("");
    setTransitionProposalId("");
    setLoadingTransitionProposalAmount(true);
    apiClient<{
      id?: string;
      originalProposalAmount: number | string;
      serviceProduct: string;
    }>(
      `/proposals/lead/${stageEdit.leadId}/latest`,
    )
      .then(async (proposal) => {
        let proposalId = proposal.id;
        if (!proposalId) {
          const proposals = await apiClient<
            { id: string; leadId: string; proposalDate: string }[]
          >("/proposals");
          proposalId = proposals
            .filter((item) => item.leadId === stageEdit.leadId)
            .sort(
              (left, right) =>
                new Date(right.proposalDate).getTime() -
                new Date(left.proposalDate).getTime(),
            )[0]?.id;
        }
        if (!proposalId) {
          throw new Error("No saved proposal record was found for this lead.");
        }
        if (active) setTransitionProposalId(proposalId);
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
        setStageFormError(
          error instanceof Error
            ? error.message
            : "Unable to load the latest proposal.",
        );
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
    stageEditNeedsProposalOutcome,
    stageEdit?.leadId,
  ]);

  useEffect(() => {
    if (!stageEditNeedsNegotiationCompletion || !stageEdit?.leadId) return;
    let active = true;
    setLoadingPendingNegotiationFollowUp(true);
    setPendingNegotiationCheckError("");
    setPendingNegotiationFollowUp(null);
    setPendingNegotiationOutcome(null);
    Promise.allSettled([
      apiClient<PendingNegotiationFollowUp[]>(
        "/follow-ups?type=Negotiation&status=PENDING",
      ),
      apiClient<PendingNegotiationOutcome[]>("/negotiations"),
    ])
      .then(([followUpsResult, negotiationsResult]) => {
        if (!active) return;
        const followUp =
          followUpsResult.status === "fulfilled"
            ? followUpsResult.value.find(
                (item) => item.lead.id === stageEdit.leadId,
              ) ?? null
            : null;
        const outcome =
          negotiationsResult.status === "fulfilled"
            ? negotiationsResult.value.find(
                (item) =>
                  item.lead.id === stageEdit.leadId &&
                  item.lead.stage === "NEGOTIATION" &&
                  !item.responseSavedAt,
              ) ?? null
            : null;
        setPendingNegotiationFollowUp(followUp);
        setPendingNegotiationOutcome(followUp ? null : outcome);
        setNegotiatedAmount(
          followUp?.negotiation?.negotiatedAmount == null
            ? ""
            : String(followUp.negotiation.negotiatedAmount),
        );
        setTransitionWonExpectedTimeline("");
        setTransitionWonPaymentStatus("");
        setTransitionWonAdvanceAmount("");
        if (!followUp && !outcome) {
          const failure =
            followUpsResult.status === "rejected"
              ? followUpsResult.reason
              : negotiationsResult.status === "rejected"
                ? negotiationsResult.reason
                : null;
          setPendingNegotiationCheckError(
            failure instanceof Error
              ? failure.message
              : "No pending negotiation follow-up or outcome was found for this lead.",
          );
        }
      })
      .finally(() => {
        if (active) setLoadingPendingNegotiationFollowUp(false);
      });
    return () => {
      active = false;
    };
  }, [stageEditNeedsNegotiationCompletion, stageEdit?.leadId]);

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
          {(view === "pipeline" || canAssignLeads) && (
            <Link
              className="secondary-action"
              href={view === "pipeline" ? "/leads" : "#lead-assignment"}
            >
              {view === "pipeline" ? "Lead list" : "Lead assignments"}
            </Link>
          )}
          {canCreateLeads && (
            <button className="primary" onClick={openCreateLeadForm}>
              + Add lead
            </button>
          )}
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
        <div
          className="kanban-board"
          onDragOver={(event) => {
            if (!draggingLeadId) return;
            const board = event.currentTarget;
            const bounds = board.getBoundingClientRect();
            const edgeSize = Math.min(96, bounds.width * 0.15);
            const rightDistance = bounds.right - event.clientX;
            const leftDistance = event.clientX - bounds.left;
            if (
              rightDistance < edgeSize &&
              board.scrollLeft < board.scrollWidth - board.clientWidth
            ) {
              const proximity = (edgeSize - rightDistance) / edgeSize;
              board.scrollLeft += Math.ceil(8 + proximity * 24);
            } else if (leftDistance < edgeSize && board.scrollLeft > 0) {
              const proximity = (edgeSize - leftDistance) / edgeSize;
              board.scrollLeft -= Math.ceil(8 + proximity * 24);
            }
          }}
        >
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
                      {["PROPOSAL", "NEGOTIATION", "WON"].includes(
                        lead.stage,
                      ) && (
                        <div className="lead-card-meta">
                          <span>
                            {lead.stage === "PROPOSAL"
                              ? "Proposed amount"
                              : "Final deal value"}
                          </span>
                          <strong>
                            {lead.stage === "PROPOSAL"
                              ? displayMoney(
                                  lead.proposals?.[0]?.finalAmount,
                                )
                              : lead.stage === "NEGOTIATION"
                                ? displayMoney(
                                    lead.negotiations?.[0]?.negotiatedAmount,
                                  )
                                : displayMoney(lead.finalDealValue)}
                          </strong>
                        </div>
                      )}
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
                            <option
                              key={item}
                              value={item}
                              disabled={isBackwardStageMove(lead.stage, item)}
                            >
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
                  <th>Company Name</th>
                  <th>Stage</th>
                  {view === "pipeline" && <th>Move stage</th>}
                  <th>Priority</th>
                  <th className="lead-assigned-bde-column">Assigned BDE</th>
                  <th>Next follow-up</th>
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
                    <td>{lead.businessName || "—"}</td>
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
                    <td className="lead-assigned-bde-column">
                      {canAssignLeads && view !== "pipeline" ? (
                        <select
                          aria-label={`BDE assigned to ${lead.customerName}`}
                          className="lead-assigned-bde-select"
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
                    ? stageEditNeedsInitialCall
                      ? `Complete call with ${stageEditLead.customerName}`
                      : `Next action for ${stageEditLead.customerName}`
                    : stageEditNeedsMeeting
                      ? loadingScheduledMeeting
                        ? `Checking meeting for ${stageEditLead.customerName}`
                        : scheduledMeeting
                          ? `Complete meeting with ${stageEditLead.customerName}`
                          : `Schedule a meeting with ${stageEditLead.customerName}`
                      : stageEditNeedsProposal
                        ? `Prepare proposal for ${stageEditLead.customerName}`
                        : stageEditNeedsNegotiationCompletion
                        ? stageEditNeedsNegotiationOutcome
                          ? "Save negotiation outcome"
                          : "Complete negotiation follow-up"
                        : stageEditNeedsNegotiation
                          ? `Save negotiation response for ${stageEditLead.customerName}`
                          : stageEditNeedsWonFromProposal
                            ? `Save Won outcome for ${stageEditLead.customerName}`
                            : stageEditNeedsLostFromProposal
                              ? `Save Lost outcome for ${stageEditLead.customerName}`
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
              {stageEditNeedsInitialCall && (
                <CallCompletionFields
                  leadName={stageEditLead.customerName}
                  contactMethod={contactType}
                  contactDate={contactDate}
                  responseAction={callResponseAction}
                  customerResponse={customerResponse}
                  requirement={contactRequirement}
                  lostReasonType={lostReasonType}
                  otherLostReason={otherLostReason}
                  remarks={contactRemarks}
                  scheduleMeeting={scheduleContactMeeting}
                  meetingAt={transitionMeetingAt}
                  meetingType={transitionMeetingType}
                  setResponseAction={setCallResponseAction}
                  setCustomerResponse={setCustomerResponse}
                  setRequirement={setContactRequirement}
                  setLostReasonType={setLostReasonType}
                  setOtherLostReason={setOtherLostReason}
                  setRemarks={setContactRemarks}
                  setScheduleMeeting={setScheduleContactMeeting}
                  setMeetingAt={setTransitionMeetingAt}
                  setMeetingType={(value) =>
                    setTransitionMeetingType(
                      value as (typeof MEETING_TYPES)[number],
                    )
                  }
                />
              )}
              {stageEditNeedsFollowUpPlan && (
                <>
                  <label className="form-wide">
                    Next action *
                    <select
                      required
                      value={interestedTransitionAction}
                      onChange={(event) => {
                        const action = event.target.value as
                          | ""
                          | "INTERESTED"
                          | "LOST";
                        setInterestedTransitionAction(action);
                        setTransitionMeetingAt("");
                        setInterestedMeetingType("");
                        if (action === "LOST") {
                          setLostReasonType("");
                          setOtherLostReason("");
                        }
                      }}
                    >
                      <option value="">Choose next action</option>
                      <option value="INTERESTED">Interested</option>
                      <option value="LOST">Lost</option>
                    </select>
                  </label>
                  {interestedTransitionAction === "INTERESTED" && (
                    <>
                      <ClockDateTimePicker
                        className="form-wide"
                        label="Meeting date and time"
                        required
                        minValue={`${localDateInputValue()}T00:00`}
                        value={transitionMeetingAt}
                        onChange={setTransitionMeetingAt}
                      />
                      <label className="form-wide">
                        Meeting type *
                        <select
                          required
                          value={interestedMeetingType}
                          onChange={(event) =>
                            setInterestedMeetingType(event.target.value)
                          }
                        >
                          <option value="">Choose a meeting type</option>
                          {MEETING_TYPES.map((meetingType) => (
                            <option key={meetingType} value={meetingType}>
                              {meetingType}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                  {interestedTransitionAction === "LOST" && (
                    <>
                      <label className="form-wide">
                        Lost reason *
                        <select
                          required
                          value={lostReasonType}
                          onChange={(event) => {
                            setLostReasonType(event.target.value);
                            setOtherLostReason("");
                          }}
                        >
                          <option value="">Choose a lost reason</option>
                          {LOST_REASONS.map((reason) => (
                            <option key={reason} value={reason}>
                              {reason}
                            </option>
                          ))}
                        </select>
                      </label>
                      {lostReasonType === "Other" && (
                        <label className="form-wide">
                          Other lost reason *
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
                </>
              )}
              {stageEditNeedsMeeting && loadingScheduledMeeting && (
                <div className="workspace-notice form-wide" role="status">
                  Checking whether a meeting is already scheduled...
                </div>
              )}
              {stageEditNeedsMeeting && scheduledMeeting && (
                <section className="lead-form-section form-wide">
                  <div>
                    <h3>Complete scheduled meeting</h3>
                    <p>Enter the meeting outcome and next action</p>
                  </div>
                  <div className="lead-form-fields">
                    <MeetingCompletionFields
                      requirement={completionRequirement}
                      budget={completionBudget}
                      discussionNotes={completionDiscussionNotes}
                      nextAction={completionNextAction}
                      followUpAt={completionFollowUpAt}
                      lostReason={completionLostReason}
                      otherLostReason={completionOtherLostReason}
                      setRequirement={setCompletionRequirement}
                      setBudget={setCompletionBudget}
                      setDiscussionNotes={setCompletionDiscussionNotes}
                      setNextAction={setCompletionNextAction}
                      setFollowUpAt={setCompletionFollowUpAt}
                      setLostReason={setCompletionLostReason}
                      setOtherLostReason={setCompletionOtherLostReason}
                    />
                  </div>
                </section>
              )}
              {stageEditNeedsMeeting && !loadingScheduledMeeting && !scheduledMeeting && !scheduledMeetingCheckError && (
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
              {stageEditNeedsProposal && loadingPendingProposalFollowUp && (
                <div className="workspace-notice form-wide" role="status">
                  Checking for a pending proposal follow-up...
                </div>
              )}
              {stageEditNeedsProposal && pendingProposalFollowUp && (
                <section className="lead-form-section form-wide">
                  <div>
                    <h3>Complete pending proposal follow-up</h3>
                    <p>
                      Complete the existing proposal task and move the lead to
                      Proposal
                    </p>
                  </div>
                  <div className="lead-form-fields">
                    <ProposalCompletionFields
                      leadName={stageEditLead.customerName}
                      serviceProduct={transitionProposalService}
                      proposalAmount={transitionProposalAmount}
                      discount={transitionProposalDiscount}
                      followUpDate={pendingProposalFollowUpDate}
                      setServiceProduct={setTransitionProposalService}
                      setProposalAmount={setTransitionProposalAmount}
                      setDiscount={setTransitionProposalDiscount}
                      setFollowUpDate={setPendingProposalFollowUpDate}
                    />
                  </div>
                </section>
              )}
              {stageEditNeedsProposal &&
                !loadingPendingProposalFollowUp &&
                !pendingProposalFollowUp &&
                !pendingProposalCheckError && (
                <>
                  <section className="lead-form-section form-wide">
                    <div>
                      <h3>Proposal details</h3>
                      <p>
                        Review the lead number, date, service, and pricing
                      </p>
                    </div>
                    <div className="lead-form-fields">
                      <label>
                        Lead Number
                        <input
                          readOnly
                          value={stageEditLead?.leadNumber ?? ""}
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
                          step="0.01"
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
                          step="0.01"
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
              {stageEditNeedsProposalOutcome &&
                loadingTransitionProposalAmount && (
                  <div className="workspace-notice form-wide" role="status">
                    Loading the latest proposal details...
                  </div>
                )}
              {stageEditNeedsNegotiation &&
                !loadingTransitionProposalAmount && (
                <>
                  <label>
                    Proposal amount (₹)
                    <input
                      type="number"
                      readOnly
                      value={transitionOriginalProposalAmount}
                    />
                  </label>
                  <label>
                    Customer expected amount (₹) *
                    <input
                      required
                      min="0"
                      step="0.01"
                      type="number"
                      value={transitionCustomerExpectedAmount}
                      onChange={(event) =>
                        setTransitionCustomerExpectedAmount(
                          event.target.value,
                        )
                      }
                    />
                  </label>
                  <label className="form-wide">
                    Customer response *
                    <textarea
                      required
                      rows={3}
                      value={transitionProposalResponse}
                      onChange={(event) =>
                        setTransitionProposalResponse(event.target.value)
                      }
                    />
                  </label>
                </>
              )}
              {stageEditNeedsWonFromProposal &&
                !loadingTransitionProposalAmount && (
                  <>
                    <label className="form-wide">
                      Expected timeline *
                      <input
                        required
                        value={transitionWonExpectedTimeline}
                        onChange={(event) =>
                          setTransitionWonExpectedTimeline(event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Payment status *
                      <select
                        required
                        value={transitionWonPaymentStatus}
                        onChange={(event) =>
                          setTransitionWonPaymentStatus(
                            event.target.value as
                              | ""
                              | (typeof WON_RESPONSE_PAYMENT_STATUSES)[number],
                          )
                        }
                      >
                        <option value="">Choose payment status</option>
                        {WON_RESPONSE_PAYMENT_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </label>
                    {transitionWonPaymentStatus === "Advance Payment" && (
                      <label>
                        Advance amount (₹) *
                        <input
                          required
                          min="0.01"
                          max={finalDealValue}
                          step="0.01"
                          type="number"
                          value={transitionWonAdvanceAmount}
                          onChange={(event) =>
                            setTransitionWonAdvanceAmount(event.target.value)
                          }
                        />
                      </label>
                    )}
                  </>
                )}
              {stageEditNeedsNegotiationCompletion && (
                <>
                  {loadingPendingNegotiationFollowUp && (
                    <div className="workspace-notice form-wide" role="status">
                      Loading pending negotiation follow-up...
                    </div>
                  )}
                  {pendingNegotiationCheckError && (
                    <div className="workspace-notice form-wide" role="alert">
                      {pendingNegotiationCheckError}
                    </div>
                  )}
                  {pendingNegotiationFollowUp && (
                    <>
                      <label>
                        Lead name
                        <input
                          disabled
                          value={pendingNegotiationFollowUp.lead.customerName}
                        />
                      </label>
                      <label>
                        Original proposal amount
                        <input
                          readOnly
                          value={displayMoney(
                            pendingNegotiationFollowUp.negotiation
                              ?.originalProposalAmount,
                          )}
                        />
                      </label>
                      <label>
                        Customer expected amount
                        <input
                          readOnly
                          value={displayMoney(
                            pendingNegotiationFollowUp.negotiation
                              ?.customerExpectedAmount,
                          )}
                        />
                      </label>
                      <label>
                        Negotiated amount *
                        <input
                          required
                          min="0"
                          step="0.01"
                          type="number"
                          value={negotiatedAmount}
                          onChange={(event) =>
                            setNegotiatedAmount(event.target.value)
                          }
                        />
                      </label>
                    </>
                  )}
                  {stageEditNeedsNegotiationOutcome && (
                    <>
                      <label className="form-wide">
                        Expected timeline *
                        <input
                          required
                          value={transitionWonExpectedTimeline}
                          onChange={(event) =>
                            setTransitionWonExpectedTimeline(event.target.value)
                          }
                        />
                      </label>
                      <label>
                        Payment status *
                        <select
                          required
                          value={transitionWonPaymentStatus}
                          onChange={(event) =>
                            setTransitionWonPaymentStatus(
                              event.target.value as
                                | ""
                                | (typeof WON_RESPONSE_PAYMENT_STATUSES)[number],
                            )
                          }
                        >
                          <option value="">Choose payment status</option>
                          {WON_RESPONSE_PAYMENT_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </label>
                      {transitionWonPaymentStatus === "Advance Payment" && (
                        <label>
                          Advance payment amount *
                          <input
                            required
                            min="0.01"
                            step="0.01"
                            type="number"
                            value={transitionWonAdvanceAmount}
                            onChange={(event) =>
                              setTransitionWonAdvanceAmount(event.target.value)
                            }
                          />
                        </label>
                      )}
                    </>
                  )}
                </>
              )}
              {stageEdit.stage === "WON" &&
                !stageEditNeedsWonFromProposal &&
                !stageEditNeedsNegotiationCompletion && (
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
                      step="0.01"
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
                    ? stageEditNeedsFollowUpPlan
                      ? "Choose Interested to schedule a meeting, or Lost."
                      : "Contact date, contact type, and customer response are required."
                    : stageEditNeedsMeeting
                      ? scheduledMeeting
                        ? "Complete the scheduled meeting with its next action."
                        : "Schedule a meeting and set the next action and follow-up."
                      : stageEditNeedsProposal
                        ? pendingProposalFollowUp
                          ? "Complete the pending proposal follow-up to move this lead to Proposal."
                          : "Proposal service, amount, date, and follow-up are required."
                        : stageEditNeedsNegotiation
                          ? "Record the customer's expected amount and response to save the proposal outcome."
                          : stageEditNeedsNegotiationCompletion
                            ? stageEditNeedsNegotiationOutcome
                              ? "Saving this pending outcome marks the negotiation Won."
                              : "Completing this follow-up updates the negotiated amount and keeps the lead in Negotiation."
                            : stageEditNeedsWonFromProposal
                              ? "Expected timeline and payment details are required to mark this proposal Won."
                              : stageEditNeedsLostFromProposal
                                ? "Choose a lost reason to save the proposal outcome."
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
                  <button
                    className="primary"
                    type="submit"
                    disabled={
                      busy ||
                      (stageEditNeedsMeeting &&
                        (loadingScheduledMeeting ||
                          Boolean(scheduledMeetingCheckError))) ||
                      (stageEditNeedsProposal &&
                        (loadingPendingProposalFollowUp ||
                          Boolean(pendingProposalCheckError))) ||
                      (stageEditNeedsProposalOutcome &&
                        loadingTransitionProposalAmount) ||
                      (stageEditNeedsNegotiationCompletion &&
                        (loadingPendingNegotiationFollowUp ||
                          Boolean(pendingNegotiationCheckError) ||
                          (!pendingNegotiationFollowUp &&
                            !pendingNegotiationOutcome))) ||
                      Boolean(
                        stageEditNeedsNegotiationCompletion &&
                          pendingNegotiationFollowUp &&
                          !negotiatedAmount,
                      )
                    }
                  >
                    {busy
                      ? "Saving..."
                      : stageEditNeedsContact
                        ? stageEdit.stage === "CONTACTED"
                          ? "Save contact and move to Contacted"
                          : interestedTransitionAction === "LOST"
                            ? "Move to Lost"
                            : interestedTransitionAction === "INTERESTED"
                              ? "Schedule meeting and move to Interested"
                              : "Continue"
                        : stageEditNeedsMeeting
                          ? scheduledMeeting
                            ? "Complete meeting"
                            : "Schedule meeting and move to Meetings"
                          : stageEditNeedsProposal
                            ? pendingProposalFollowUp
                              ? "Complete proposal and move to Proposal"
                              : "Create proposal and move to Proposal"
                            : stageEditNeedsNegotiation
                            ? "Save customer response and move to Negotiation"
                            : stageEditNeedsWonFromProposal
                              ? "Save Won outcome"
                              : stageEditNeedsNegotiationCompletion
                                ? stageEditNeedsNegotiationOutcome
                                  ? "Save Won outcome"
                                  : "Complete negotiation follow-up"
                              : stageEditNeedsLostFromProposal
                                ? "Save Lost outcome"
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
                      Estimated Budget
                      <input
                        min="0"
                        step="0.01"
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
                      <option value="">No BDE selected</option>
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
                    Current Stage
                    <select
                      disabled
                      value={editingLeadId ? form.stage : "NEW_LEAD"}
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
                          step="0.01"
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
