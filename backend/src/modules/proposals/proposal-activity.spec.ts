import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  proposalActivityDescription,
  proposalActivityDescriptionForDisplay,
} from "./proposal-activity";

test("proposal descriptions leave structured next action and follow-up fields to the timeline", () => {
  const description = proposalActivityDescription({
    leadNumber: "DZN-2026-00004",
    serviceProduct: "Website",
    proposalDate: new Date("2026-10-23T00:00:00.000Z"),
    proposalAmount: 150000,
    discount: 10000,
    tax: 0,
    finalAmount: 140000,
    followUpAt: new Date("2026-10-24T00:00:00.000Z"),
    nextAction: "Follow up on proposal",
  });

  assert.match(description, /Proposal amount: ₹1,50,000\.00/);
  assert.doesNotMatch(description, /Next action:|Follow-up:/);
});

test("proposal description display removes legacy duplicates only when structured values exist", () => {
  const description = [
    "Proposal DZN-2026-00004 prepared for Website",
    "Next action: Follow up on proposal",
    "Follow-up: 2026-10-24T00:00:00.000Z",
  ].join("\n");

  assert.equal(
    proposalActivityDescriptionForDisplay(
      description,
      true,
      true,
    ),
    "Proposal DZN-2026-00004 prepared for Website",
  );
  assert.equal(
    proposalActivityDescriptionForDisplay(
      description,
      false,
      false,
    ),
    description,
  );
});
