import { Dispatch, SetStateAction } from "react";
import { ClockDateTimePicker } from "../../components/shared/clock-date-time-picker";
import { LOST_REASONS } from "../leads/lost-reasons";

const MEETING_TYPES = [
  "Online Meeting",
  "Offline Meeting",
  "Product Demo",
  "Requirement Discussion",
  "Business Discussion",
];

function localDateKey(date: Date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

type CallCompletionFieldsProps = {
  leadName: string;
  contactMethod: string;
  contactDate: string;
  responseAction: string;
  customerResponse: string;
  requirement: string;
  lostReasonType: string;
  otherLostReason: string;
  remarks: string;
  scheduleMeeting: boolean | null;
  meetingAt: string;
  meetingType: string;
  setResponseAction: (value: string) => void;
  setCustomerResponse: (value: string) => void;
  setRequirement: (value: string) => void;
  setLostReasonType: (value: string) => void;
  setOtherLostReason: (value: string) => void;
  setRemarks: (value: string) => void;
  setScheduleMeeting: Dispatch<SetStateAction<boolean | null>>;
  setMeetingAt: (value: string) => void;
  setMeetingType: (value: string) => void;
};

export function CallCompletionFields({
  leadName,
  contactMethod,
  contactDate,
  responseAction,
  customerResponse,
  requirement,
  lostReasonType,
  otherLostReason,
  remarks,
  scheduleMeeting,
  meetingAt,
  meetingType,
  setResponseAction,
  setCustomerResponse,
  setRequirement,
  setLostReasonType,
  setOtherLostReason,
  setRemarks,
  setScheduleMeeting,
  setMeetingAt,
  setMeetingType,
}: CallCompletionFieldsProps) {
  return (
    <>
      <label className="form-wide">
        Lead name *
        <input readOnly required value={leadName} />
      </label>
      <label>
        Contact type *
        <input readOnly required value={contactMethod} />
      </label>
      <label>
        Contact date *
        <input readOnly required type="date" value={contactDate} />
      </label>
      <label className="form-wide">
        Next action *
        <select
          required
          value={responseAction}
          onChange={(event) => {
            setResponseAction(event.target.value);
            setScheduleMeeting(null);
            setMeetingAt("");
            setMeetingType("");
          }}
        >
          <option value="">Select the customer response</option>
          <option value="Interested">Interested</option>
          <option value="Not Interested">Not interested</option>
          <option value="Decision pending">Decision pending</option>
        </select>
      </label>
      {responseAction && (
        <>
          {responseAction === "Not Interested" ? (
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
                    onChange={(event) => setOtherLostReason(event.target.value)}
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
                  value={customerResponse}
                  onChange={(event) => setCustomerResponse(event.target.value)}
                />
              </label>
              <label className="form-wide">
                Requirements *
                <textarea
                  required
                  rows={3}
                  value={requirement}
                  onChange={(event) => setRequirement(event.target.value)}
                />
              </label>
            </>
          )}
          <label className="form-wide">
            Remarks
            <textarea
              rows={2}
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
            />
          </label>
        </>
      )}
      {responseAction === "Interested" && (
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
              setMeetingAt("");
              setMeetingType("");
            }}
          >
            <option value="">Choose an option</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </label>
      )}
      {scheduleMeeting && responseAction === "Interested" && (
        <>
          <ClockDateTimePicker
            className="form-wide"
            label="Meeting date and time"
            required
            minValue={`${localDateKey(new Date())}T00:00`}
            value={meetingAt}
            onChange={setMeetingAt}
          />
          <label className="form-wide">
            Meeting type *
            <select
              required
              value={meetingType}
              onChange={(event) => setMeetingType(event.target.value)}
            >
              <option value="">Choose a meeting type</option>
              {MEETING_TYPES.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
        </>
      )}
    </>
  );
}
