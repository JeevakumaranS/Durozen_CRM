import * as assert from "node:assert/strict";
import { test } from "node:test";
import { validate } from "class-validator";
import { CreateMeetingDto } from "./create-meeting.dto";

function meetingWithBudget(budget: number) {
  return Object.assign(new CreateMeetingDto(), {
    leadId: "11111111-1111-4111-8111-111111111111",
    meetingAt: "2026-10-23T10:00:00.000Z",
    type: "Online Meeting",
    budget,
    nextAction: "Attend scheduled meeting",
    followUpAt: "2026-10-23T10:00:00.000Z",
  });
}

test("meeting budgets allow at most two decimal places", async () => {
  assert.deepEqual(await validate(meetingWithBudget(123.45)), []);
  assert.ok((await validate(meetingWithBudget(123.456))).length > 0);
});
