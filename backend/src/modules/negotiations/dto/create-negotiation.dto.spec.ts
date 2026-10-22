import * as assert from "node:assert/strict";
import { test } from "node:test";
import { validate } from "class-validator";
import { CreateNegotiationDto } from "./create-negotiation.dto";

function negotiationWithAmounts(amount: number) {
  return Object.assign(new CreateNegotiationDto(), {
    leadId: "11111111-1111-4111-8111-111111111111",
    originalProposalAmount: amount,
    customerExpectedAmount: amount,
    negotiatedAmount: amount,
    nextAction: "Follow up",
    followUpAt: "2026-10-23T10:00:00.000Z",
  });
}

test("negotiation prices allow at most two decimal places", async () => {
  assert.deepEqual(await validate(negotiationWithAmounts(123.45)), []);
  assert.ok((await validate(negotiationWithAmounts(123.456))).length > 0);
});
