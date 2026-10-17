"use client";

import Link from "next/link";
import { FormEvent, Fragment, useEffect, useState } from "react";
import { apiClient } from "../../../lib/api-client";
import { notify } from "../../../lib/notifications";
import { ClockDateTimePicker } from "../../../components/shared/clock-date-time-picker";
import { DateRangePicker } from "../../../components/shared/date-range-picker";
import { LOST_REASONS } from "../../../features/leads/lost-reasons";
import {
  businessDateTimeInputValue,
  businessDateTimeToIso,
  formatBusinessDateTime,
  formatEmbeddedDateTimes,
} from "../../../lib/business-time";

type Activity = {
  id: string;
  type: string;
  contactType?: string | null;
  description: string;
  outcome?: string | null;
  nextAction?: string | null;
  createdAt: string;
  user?: { fullName: string } | null;
  lead: {
    id: string;
    customerName: string;
    businessName?: string | null;
    assignedBde: { fullName: string };
  };
};
type ActivityPage = {
  items: Activity[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
type ContactLead = {
  id: string;
  customerName: string;
  mobileNumber: string;
  stage: string;
};
type CallTask = {
  id: string;
  dueAt: string;
  contactMethod: string;
  description?: string | null;
  outcome?: string | null;
  completedAt?: string | null;
  status: "PENDING" | "COMPLETED" | "RESCHEDULED" | "CANCELLED";
  lead: {
    id: string;
    customerName: string;
    businessName?: string | null;
    mobileNumber: string;
    stage: string;
    assignedBde: { fullName: string };
    activities?: { contactType: string | null }[];
  };
};
const TYPES = [
  "Call",
  "WhatsApp",
  "Email",
  "Meeting",
  "Demo",
  "Note",
  "Proposal Sent",
  "Negotiation",
  "MEETING_SCHEDULED",
  "MEETING_UPDATED",
  "MEETING_RESCHEDULED",
  "MEETING_COMPLETED",
  "MEETING_CANCELLED",
];
const PAGE_SIZE = 15;
const localDateKey = (date: Date) => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
};

export function ActivitiesPage({
  initialType = "",
  callsOnly = false,
}: {
  initialType?: string;
  callsOnly?: boolean;
}) {
  const pageTitle = callsOnly ? "Calls & Msg" : "Activities";
  const [activities, setActivities] = useState<Activity[]>([]);
  const [callTasks, setCallTasks] = useState<CallTask[]>([]);
  const [contactLeads, setContactLeads] = useState<ContactLead[]>([]);
  const [callTasksLoading, setCallTasksLoading] = useState(callsOnly);
  const [callStatusFilters, setCallStatusFilters] = useState<
    CallTask["status"][]
  >([]);
  const [callDateFilterEnabled, setCallDateFilterEnabled] = useState(false);
  const [callDateFrom, setCallDateFrom] = useState("");
  const [callDateTo, setCallDateTo] = useState("");
  const [callTaskRefresh, setCallTaskRefresh] = useState(0);
  const [expandedCallTaskId, setExpandedCallTaskId] = useState<string | null>(
    null,
  );
  const [callDialog, setCallDialog] = useState<
    "schedule" | "log" | "complete" | "reschedule" | null
  >(null);
  const [completingCall, setCompletingCall] = useState<CallTask | null>(null);
  const [callLeadId, setCallLeadId] = useState("");
  const [callType, setCallType] = useState("Phone Call");
  const [callDescription, setCallDescription] = useState("");
  const [callOutcome, setCallOutcome] = useState("");
  const [callDueAt, setCallDueAt] = useState("");
  const [callResponseAction, setCallResponseAction] = useState("");
  const [callContactDate, setCallContactDate] = useState("");
  const [callCustomerResponse, setCallCustomerResponse] = useState("");
  const [callRequirement, setCallRequirement] = useState("");
  const [callLostReasonType, setCallLostReasonType] = useState<string>(
    LOST_REASONS[0],
  );
  const [callOtherLostReason, setCallOtherLostReason] = useState("");
  const [callRemarks, setCallRemarks] = useState("");
  const [scheduleMeeting, setScheduleMeeting] = useState<boolean | null>(null);
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [meetingType, setMeetingType] = useState("");
  const [callBusy, setCallBusy] = useState(false);
  const [type, setType] = useState(initialType);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!callsOnly) return;
    let current = true;
    setCallTasksLoading(true);
    const params = new URLSearchParams();
    if (callStatusFilters.length) params.set("status", callStatusFilters.join(","));
    if (callDateFilterEnabled && callDateFrom) params.set("from", callDateFrom);
    if (callDateFilterEnabled && callDateTo) params.set("to", callDateTo);
    Promise.all([
      apiClient<CallTask[]>(`/calls-messages?${params}`),
      apiClient<ContactLead[]>("/leads"),
    ])
      .then(([tasks, leads]) => {
        if (!current) return;
        setCallTasks(
          tasks.filter((task) =>
            ["phone call", "call", "whatsapp", "email"].includes(
              task.contactMethod.trim().toLowerCase(),
            ) &&
            (!callStatusFilters.length ||
              callStatusFilters.includes(task.status)),
          ),
        );
        setContactLeads(
          leads.filter((lead) =>
            !["WON", "LOST"].includes(lead.stage),
          ),
        );
      })
      .catch((reason: unknown) => {
        if (!current) return;
        const message =
          reason instanceof Error
            ? reason.message
            : "Unable to load call and message tasks and leads.";
        notify(message, "error");
      })
      .finally(() => {
        if (current) setCallTasksLoading(false);
      });
    return () => {
      current = false;
    };
  }, [
    callDateFilterEnabled,
    callDateFrom,
    callDateTo,
    callStatusFilters,
    callTaskRefresh,
    callsOnly,
  ]);

  useEffect(() => {
    if (callsOnly) {
      setLoading(false);
      return;
    }
    let current = true;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (callsOnly) params.set("category", "CALLS");
    if (type) params.set("type", type);
    if (query.trim()) params.set("search", query.trim());
    setLoading(true);
    setError("");
    apiClient<ActivityPage>(`/activities?${params}`)
      .then((result) => {
        if (!current) return;
        setActivities(result.items);
        setTotal(result.total);
        setTotalPages(result.totalPages);
      })
      .catch((reason: unknown) => {
        if (!current) return;
        const message =
          reason instanceof Error
            ? reason.message
            : "Unable to load activities.";
        setError(message);
        notify(message, "error");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [callsOnly, page, query, type]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleCallTasks = callTasks.filter((task) =>
    [
      task.lead.customerName,
      task.lead.businessName,
      task.lead.mobileNumber,
      task.contactMethod,
      task.lead.assignedBde.fullName,
      task.description,
      task.outcome,
    ]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(normalizedQuery)),
  );

  function openCallDialog(
    mode: "schedule" | "log" | "complete" | "reschedule",
    task?: CallTask,
  ) {
    setCallDialog(mode);
    setCompletingCall(
      mode === "complete" || mode === "reschedule" ? task ?? null : null,
    );
    setCallLeadId(task?.lead.id ?? "");
    setCallType(task?.contactMethod ?? "Phone Call");
    setCallDescription(mode === "complete" ? task?.description ?? "" : "");
    setCallOutcome(mode === "complete" ? task?.outcome ?? "" : "");
    setCallResponseAction("");
    setCallContactDate(mode === "complete" ? localDateKey(new Date()) : "");
    setCallCustomerResponse("");
    setCallRequirement("");
    setCallLostReasonType(LOST_REASONS[0]);
    setCallOtherLostReason("");
    setCallRemarks("");
    setScheduleMeeting(null);
    setMeetingDate("");
    setMeetingTime("");
    setMeetingType("");
    setCallDueAt(
      mode === "reschedule" && task
        ? businessDateTimeInputValue(task.dueAt)
        : mode === "complete"
          ? ""
          : mode === "log"
            ? new Date().toISOString().slice(0, 16)
            : "",
    );
  }

  async function saveCall(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (callDialog === "complete") {
      if (!completingCall) return;
      if (
        !callResponseAction ||
        (callResponseAction === "Not Interested"
          ? callLostReasonType === "Other"
            ? !callOtherLostReason.trim()
            : !callLostReasonType
          : !callCustomerResponse.trim() || !callRequirement.trim())
      ) {
        notify(
          callResponseAction === "Not Interested"
            ? "Choose the next action and enter a lost reason."
            : "Choose the next action and enter the customer response and requirements.",
          "error",
        );
        return;
      }
      if (callResponseAction === "Interested" && scheduleMeeting === null) {
        notify("Choose whether to schedule a meeting.", "error");
        return;
      }
      if (
        scheduleMeeting &&
        (!meetingDate || !meetingTime || !meetingType)
      ) {
        notify("Enter the meeting date, time, and type.", "error");
        return;
      }
      if (
        scheduleMeeting &&
        new Date(
          businessDateTimeToIso(`${meetingDate}T${meetingTime}`),
        ).getTime() <= Date.now()
      ) {
        notify("The meeting date and time must be in the future.", "error");
        return;
      }
    } else if (
      callDialog === "reschedule"
        ? !callDueAt ||
          new Date(businessDateTimeToIso(callDueAt)).getTime() <= Date.now()
        : !callLeadId || !callDueAt
    ) {
      notify("Choose a lead and date before saving.", "error");
      return;
    }
    setCallBusy(true);
    try {
      if (callDialog === "complete" && completingCall) {
        await apiClient(`/calls-messages/${completingCall.id}/complete`, {
          method: "PATCH",
          body: JSON.stringify({
            responseAction: callResponseAction,
            contactDate: callContactDate,
            customerResponse:
              callResponseAction === "Not Interested"
                ? undefined
                : callCustomerResponse.trim(),
            requirement:
              callResponseAction === "Not Interested"
                ? undefined
                : callRequirement.trim(),
            lostReason:
              callResponseAction === "Not Interested"
                ? callLostReasonType === "Other"
                  ? callOtherLostReason.trim()
                  : callLostReasonType
                : undefined,
            remarks: callRemarks.trim() || undefined,
            scheduleMeeting: callResponseAction === "Interested"
              ? scheduleMeeting
              : false,
            meetingAt: scheduleMeeting
              ? businessDateTimeToIso(`${meetingDate}T${meetingTime}`)
              : undefined,
            meetingType: scheduleMeeting ? meetingType : undefined,
          }),
        });
        notify("Call completed and lead updated.");
      } else if (callDialog === "reschedule" && completingCall) {
        await apiClient(`/calls-messages/${completingCall.id}/reschedule`, {
          method: "PATCH",
          body: JSON.stringify({
            dueAt: businessDateTimeToIso(callDueAt),
          }),
        });
        notify("Phone call rescheduled.");
      } else if (callDialog === "schedule") {
        await apiClient("/calls-messages", {
          method: "POST",
          body: JSON.stringify({
            leadId: callLeadId,
            dueAt: new Date(callDueAt).toISOString(),
            contactMethod: callType,
            status: "PENDING",
            description: callDescription.trim() || undefined,
          }),
        });
        notify("Call scheduled in Calls & Msg.");
      } else {
        await apiClient("/calls-messages", {
          method: "POST",
          body: JSON.stringify({
            leadId: callLeadId,
            dueAt: new Date(callDueAt).toISOString(),
            contactMethod: callType,
            status: "COMPLETED",
            description: callDescription.trim(),
            outcome: callOutcome.trim() || undefined,
          }),
        });
        notify("Call logged in Calls & Msg.");
      }
      setCallDialog(null);
      setCallTaskRefresh((current) => current + 1);
    } catch (reason) {
      notify(
        reason instanceof Error ? reason.message : "Unable to save call.",
        "error",
      );
    } finally {
      setCallBusy(false);
    }
  }

  return (
    <main className="lead-workspace activity-workspace">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">CUSTOMER TOUCHPOINTS</p>
          <h1>{pageTitle}</h1>
          {!callsOnly && (
            <p className="subtitle">
              Recent customer interactions across your accessible leads.
            </p>
          )}
        </div>
        {callsOnly ? (
          <div className="workspace-actions calls-header-actions">
            <button
              className="secondary-action"
              onClick={() => openCallDialog("log")}
              type="button"
            >
              Log call
            </button>
            <button
              className="primary"
              onClick={() => openCallDialog("schedule")}
              type="button"
            >
              Schedule call
            </button>
          </div>
        ) : (
          <Link className="secondary-action" href="/leads">
            All leads
          </Link>
        )}
      </header>
      <div className="activity-tools">
        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="Search activities"
            placeholder={callsOnly ? "Search leads..." : "Search customer, description, BDE..."}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </label>
        {!callsOnly && (
          <label>
            Activity type
            <select
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All types</option>
              {TYPES.map((item) => (
                <option key={item} value={item}>
                  {item.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {callsOnly ? (
        <section className="calls-leads-section" aria-label="Leads with call and message next actions">
          <div className="calls-filter-layout">
              <aside aria-label="Filter calls and messages" className="follow-up-filters">
                <h2>Filter Calls &amp; Msg</h2>
                <div className="follow-up-filter-options">
                  <div className="follow-up-filter-option">
                    <strong className="follow-up-status-filter-heading">Status</strong>
                    {(["PENDING", "COMPLETED"] as const).map(
                      (status) => (
                        <label className="follow-up-filter-checkbox" key={status}>
                          <input
                            checked={callStatusFilters.includes(status)}
                            onChange={(event) => {
                              setExpandedCallTaskId(null);
                              setCallStatusFilters((current) =>
                                event.target.checked
                                  ? [...current, status]
                                  : current.filter((item) => item !== status),
                              );
                            }}
                            type="checkbox"
                          />
                          {status.charAt(0) + status.slice(1).toLowerCase()}
                        </label>
                      ),
                    )}
                  </div>
                  <div className="follow-up-filter-option">
                    <label className="follow-up-filter-checkbox">
                      <input
                        checked={callDateFilterEnabled}
                        onChange={(event) => {
                          setCallDateFilterEnabled(event.target.checked);
                          if (!event.target.checked) {
                            setCallDateFrom("");
                            setCallDateTo("");
                          }
                        }}
                        type="checkbox"
                      />
                      Date
                    </label>
                    {callDateFilterEnabled && (
                      <DateRangePicker
                        from={callDateFrom}
                        onChange={(from, to) => {
                          setCallDateFrom(from);
                          setCallDateTo(to);
                        }}
                        to={callDateTo}
                      />
                    )}
                  </div>
                </div>
                <button
                  className="secondary-action follow-up-clear"
                  onClick={() => {
                    setCallStatusFilters([]);
                    setCallDateFilterEnabled(false);
                    setCallDateFrom("");
                    setCallDateTo("");
                    setExpandedCallTaskId(null);
                  }}
                  type="button"
                >
                  Clear filters
                </button>
              </aside>
            <div className="calls-filter-results">
          {callTasksLoading ? (
            <div className="empty-list" role="status">Loading call tasks...</div>
          ) : visibleCallTasks.length === 0 ? (
            <div className="empty-list">
              No call or message tasks match these filters.
            </div>
          ) : (
            <div className="lead-table-wrap calls-lead-table-wrap">
              <table className="lead-table calls-lead-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Company</th>
                    <th>Next action</th>
                    <th>Stage</th>
                    <th>Assigned BDE</th>
                    <th>Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleCallTasks.map((task, index) => (
                    <Fragment key={task.id}>
                      <tr
                        className={`calls-lead-table-row${index % 2 ? " is-striped" : ""}`}
                      >
                        <td>
                          <button
                            aria-expanded={expandedCallTaskId === task.id}
                            className="calls-table-expand"
                            onClick={() =>
                              setExpandedCallTaskId((current) =>
                                current === task.id ? null : task.id,
                              )
                            }
                            type="button"
                          >
                            {task.lead.customerName}
                          </button>
                          <small>{task.lead.mobileNumber}</small>
                        </td>
                        <td>{task.lead.businessName || "—"}</td>
                        <td>
                          {task.contactMethod}
                          {task.status === "PENDING" && (
                            <span className="calls-pending-label">Pending</span>
                          )}
                        </td>
                        <td>
                          <span className="stage-pill">
                            {task.lead.stage.replaceAll("_", " ")}
                          </span>
                        </td>
                        <td>{task.lead.assignedBde.fullName}</td>
                        <td>
                          {formatBusinessDateTime(task.dueAt)}
                        </td>
                        <td>
                          {task.status === "PENDING" ? (
                            <>
                              {task.contactMethod.trim().toLowerCase() ===
                                "phone call" && (
                                <button
                                  className="lead-edit"
                                  onClick={() =>
                                    openCallDialog("reschedule", task)
                                  }
                                  type="button"
                                >
                                  Reschedule
                                </button>
                              )}
                              <button
                                className="lead-edit"
                                onClick={() => openCallDialog("complete", task)}
                                type="button"
                              >
                                Complete
                              </button>
                            </>
                          ) : (
                            <span className="calls-completed-label">Logged</span>
                          )}
                        </td>
                      </tr>
                      {expandedCallTaskId === task.id && (
                        <tr className="calls-lead-detail-row">
                          <td colSpan={7}>
                            <div className="calls-lead-details">
                              <dl>
                                <div><dt>Contact method</dt><dd>{task.contactMethod}</dd></div>
                                <div><dt>Due date</dt><dd>{formatBusinessDateTime(task.dueAt)}</dd></div>
                                <div><dt>Phone</dt><dd>{task.lead.mobileNumber}</dd></div>
                                <div><dt>Company</dt><dd>{task.lead.businessName || "—"}</dd></div>
                                <div><dt>Stage</dt><dd>{task.lead.stage.replaceAll("_", " ")}</dd></div>
                                <div><dt>Assigned BDE</dt><dd>{task.lead.assignedBde.fullName}</dd></div>
                                {task.description && <div className="calls-lead-remarks"><dt>Notes</dt><dd>{task.description}</dd></div>}
                                {task.outcome && <div className="calls-lead-remarks"><dt>Outcome</dt><dd>{task.outcome}</dd></div>}
                              </dl>
                              <Link href={`/leads/${task.lead.id}`}>Open lead details</Link>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
            </div>
          </div>
        </section>
      ) : (
      <section className="global-activity-list">
        {loading ? (
          <div className="empty-list" role="status">Loading activities...</div>
        ) : activities.map((activity) => (
          <article className="global-activity" key={activity.id}>
            <span className="global-activity-marker" />
            <div className="global-activity-content">
              <div className="global-activity-top">
                <div>
                      <strong>
                        {(activity.contactType || activity.type).replaceAll("_", " ")}
                  </strong>
                  <span>
                    {activity.user?.fullName ||
                      activity.lead.assignedBde.fullName}
                  </span>
                </div>
                <time>
                  {new Intl.DateTimeFormat("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(activity.createdAt))}
                </time>
              </div>
              <p>{formatEmbeddedDateTimes(activity.description)}</p>
              {activity.outcome && <small>Outcome: {activity.outcome}</small>}
              {activity.nextAction && (
                <small>Next action: {activity.nextAction}</small>
              )}
              <Link href={`/leads/${activity.lead.id}`}>
                {activity.lead.customerName}
                {activity.lead.businessName
                  ? ` · ${activity.lead.businessName}`
                  : ""}
              </Link>
            </div>
          </article>
        ))}
        {!loading && activities.length === 0 && (
          <div className="empty-list">
            No activity recorded for these filters.
          </div>
        )}
      </section>
      )}
      {callsOnly && callDialog && (
        <div className="modal-backdrop">
          <section
            className="lead-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="call-dialog-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">CALLS &amp; MESSAGES</p>
                <h2 id="call-dialog-title">
                  {callDialog === "schedule"
                    ? "Schedule call"
                    : callDialog === "complete"
                      ? "Complete call"
                      : callDialog === "reschedule"
                        ? "Reschedule phone call"
                        : "Log call"}
                </h2>
              </div>
              <button
                aria-label="Close"
                className="modal-close"
                onClick={() => setCallDialog(null)}
                type="button"
              >
                ×
              </button>
            </div>
            <form className="lead-form" onSubmit={saveCall}>
              {callDialog === "reschedule" ? (
                <>
                  <label className="form-wide">
                    Lead
                    <input readOnly value={completingCall?.lead.customerName ?? ""} />
                  </label>
                  <ClockDateTimePicker
                    className="form-wide"
                    label="New call date and time *"
                    minValue={`${localDateKey(new Date())}T00:00`}
                    required
                    value={callDueAt}
                    onChange={setCallDueAt}
                  />
                </>
              ) : callDialog === "complete" ? (
                <>
                  <label className="form-wide">
                    Lead name *
                    <input
                      readOnly
                      required
                      value={completingCall?.lead.customerName ?? ""}
                    />
                  </label>
                  <label>
                    Contact type *
                    <input
                      readOnly
                      required
                      value={completingCall?.contactMethod ?? ""}
                    />
                  </label>
                  <label>
                    Contact date *
                    <input readOnly required type="date" value={callContactDate} />
                  </label>
                  <label className="form-wide">
                    Next action *
                    <select
                      required
                      value={callResponseAction}
                      onChange={(event) => {
                        setCallResponseAction(event.target.value);
                        setScheduleMeeting(null);
                        setMeetingDate("");
                        setMeetingTime("");
                        setMeetingType("");
                      }}
                    >
                      <option value="">Select the customer response</option>
                      <option value="Interested">Interested</option>
                      <option value="Not Interested">Not interested</option>
                      <option value="Decision pending">Decision pending</option>
                    </select>
                  </label>
                  {callResponseAction && (
                    <>
                      {callResponseAction === "Not Interested" ? (
                        <>
                          <label className="form-wide">
                            Lost reason *
                            <select
                              required
                              value={callLostReasonType}
                              onChange={(event) => {
                                setCallLostReasonType(event.target.value);
                                setCallOtherLostReason("");
                              }}
                            >
                              {LOST_REASONS.map((reason) => (
                                <option key={reason}>{reason}</option>
                              ))}
                            </select>
                          </label>
                          {callLostReasonType === "Other" && (
                            <label className="form-wide">
                              Other reason *
                              <input
                                required
                                value={callOtherLostReason}
                                onChange={(event) =>
                                  setCallOtherLostReason(event.target.value)
                                }
                              />
                            </label>
                          )}
                        </>
                      ) : (
                        <>
                          <label className="form-wide">
                            Customer response *
                            <textarea
                              required
                              rows={3}
                              value={callCustomerResponse}
                              onChange={(event) =>
                                setCallCustomerResponse(event.target.value)
                              }
                            />
                          </label>
                          <label className="form-wide">
                            Requirements *
                            <textarea
                              required
                              rows={3}
                              value={callRequirement}
                              onChange={(event) =>
                                setCallRequirement(event.target.value)
                              }
                            />
                          </label>
                        </>
                      )}
                      <label className="form-wide">
                        Remarks
                        <textarea
                          rows={2}
                          value={callRemarks}
                          onChange={(event) => setCallRemarks(event.target.value)}
                        />
                      </label>
                    </>
                  )}
                  {callResponseAction === "Interested" && (
                    <label className="form-wide">
                      Schedule a meeting? *
                      <select
                        required
                        value={
                          scheduleMeeting === null
                            ? ""
                            : scheduleMeeting
                              ? "yes"
                              : "no"
                        }
                        onChange={(event) => {
                          setScheduleMeeting(event.target.value === "yes");
                          setMeetingDate("");
                          setMeetingTime("");
                          setMeetingType("");
                        }}
                      >
                        <option value="">Choose an option</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </label>
                  )}
                  {scheduleMeeting && callResponseAction === "Interested" && (
                    <>
                      <ClockDateTimePicker
                        className="form-wide"
                        label="Meeting date and time"
                        required
                        minValue={`${localDateKey(new Date())}T00:00`}
                        value={
                          meetingDate && meetingTime
                            ? `${meetingDate}T${meetingTime}`
                            : ""
                        }
                        onChange={(value) => {
                          const [date, time] = value.split("T");
                          setMeetingDate(date);
                          setMeetingTime(time);
                        }}
                      />
                      <label className="form-wide">
                        Meeting type *
                        <select
                          required
                          value={meetingType}
                          onChange={(event) =>
                            setMeetingType(event.target.value)
                          }
                        >
                          <option value="">Choose a meeting type</option>
                          <option>Online Meeting</option>
                          <option>Offline Meeting</option>
                          <option>Product Demo</option>
                          <option>Requirement Discussion</option>
                          <option>Business Discussion</option>
                        </select>
                      </label>
                    </>
                  )}
                </>
              ) : (
                <>
                  <label className="form-wide">
                    Lead *
                    <select
                      required
                      value={callLeadId}
                      onChange={(event) => setCallLeadId(event.target.value)}
                    >
                      <option value="">Select a lead</option>
                      {contactLeads.map((lead) => (
                        <option key={lead.id} value={lead.id}>
                          {lead.customerName} · {lead.mobileNumber}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Contact method *
                    <select
                      required
                      value={callType}
                      onChange={(event) => setCallType(event.target.value)}
                    >
                      <option>Phone Call</option>
                      <option>WhatsApp</option>
                      <option>Email</option>
                    </select>
                  </label>
                  <ClockDateTimePicker
                    label="Call date and time *"
                    required
                    value={callDueAt}
                    onChange={setCallDueAt}
                  />
                  <label className="form-wide">
                    {callDialog === "schedule" ? "Notes" : "Call notes"}
                    <textarea
                      required={callDialog !== "schedule"}
                      rows={3}
                      value={callDescription}
                      onChange={(event) => setCallDescription(event.target.value)}
                    />
                  </label>
                  {callDialog !== "schedule" && (
                    <label className="form-wide">
                      Outcome
                      <textarea
                        rows={2}
                        value={callOutcome}
                        onChange={(event) => setCallOutcome(event.target.value)}
                      />
                    </label>
                  )}
                </>
              )}
              <div className="form-footer">
                <p>
                  {callDialog === "schedule"
                    ? "Scheduled calls appear in Tasks until completed."
                    : callDialog === "complete"
                      ? "Completed calls are retained in Logs."
                      : callDialog === "reschedule"
                        ? "The call remains pending at the new date and time."
                      : "This call is saved directly to Logs."}
                </p>
                <button className="primary" disabled={callBusy}>
                  {callBusy
                    ? "Saving..."
                    : callDialog === "complete"
                      ? "Complete call"
                      : callDialog === "schedule"
                        ? "Schedule call"
                        : callDialog === "reschedule"
                          ? "Reschedule call"
                        : "Log call"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {!callsOnly && !loading && (
        <nav className="pagination" aria-label="Activity pages">
          <span>
            {total === 0
              ? "0–0 of 0"
              : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
          </span>
          {totalPages > 0 && (
            <div className="pagination-controls">
              <button
                className="secondary-action"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </button>
              <strong>
                Page {page} of {totalPages}
              </strong>
              <button
                className="secondary-action"
                disabled={page >= totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          )}
        </nav>
      )}
    </main>
  );
}
