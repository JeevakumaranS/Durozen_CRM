import { ClockDateTimePicker } from "../../components/shared/clock-date-time-picker";
import { businessDateTimeInputValue } from "../../lib/business-time";
import { LOST_REASONS } from "../leads/lost-reasons";

type MeetingCompletionFieldsProps = {
  requirement: string;
  budget: string;
  discussionNotes: string;
  nextAction: string;
  followUpAt: string;
  lostReason: string;
  otherLostReason: string;
  setRequirement: (value: string) => void;
  setBudget: (value: string) => void;
  setDiscussionNotes: (value: string) => void;
  setNextAction: (value: string) => void;
  setFollowUpAt: (value: string) => void;
  setLostReason: (value: string) => void;
  setOtherLostReason: (value: string) => void;
};

export function MeetingCompletionFields({
  requirement,
  budget,
  discussionNotes,
  nextAction,
  followUpAt,
  lostReason,
  otherLostReason,
  setRequirement,
  setBudget,
  setDiscussionNotes,
  setNextAction,
  setFollowUpAt,
  setLostReason,
  setOtherLostReason,
}: MeetingCompletionFieldsProps) {
  return (
    <>
      <label className="form-wide">
        Requirement *
        <textarea
          required
          rows={2}
          value={requirement}
          onChange={(event) => setRequirement(event.target.value)}
        />
      </label>
      <label>
        Budget (₹)
        <input
          type="number"
          min="0"
          step="0.01"
          value={budget}
          onChange={(event) => setBudget(event.target.value)}
        />
      </label>
      <label className="form-wide">
        Discussion notes
        <textarea
          rows={3}
          value={discussionNotes}
          onChange={(event) => setDiscussionNotes(event.target.value)}
        />
      </label>
      <label className="form-wide">
        Next action *
        <select
          required
          value={nextAction}
          onChange={(event) => {
            setNextAction(event.target.value);
            setFollowUpAt("");
            setLostReason(LOST_REASONS[0]);
            setOtherLostReason("");
          }}
        >
          <option value="">Choose next action</option>
          <option value="Proposal">Proposal</option>
          <option value="Lost">Lost</option>
        </select>
      </label>
      {nextAction === "Proposal" && (
        <ClockDateTimePicker
          className="form-wide"
          label="Next follow-up date"
          required
          minValue={businessDateTimeInputValue(new Date())}
          value={followUpAt}
          onChange={setFollowUpAt}
        />
      )}
      {nextAction === "Lost" && (
        <>
          <label className="form-wide">
            Lost reason *
            <select
              required
              value={lostReason}
              onChange={(event) => {
                setLostReason(event.target.value);
                setOtherLostReason("");
              }}
            >
              {LOST_REASONS.map((reason) => (
                <option key={reason}>{reason}</option>
              ))}
            </select>
          </label>
          {lostReason === "Other" && (
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
      )}
    </>
  );
}
