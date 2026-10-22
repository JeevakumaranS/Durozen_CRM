import * as assert from "node:assert/strict";
import { test } from "node:test";
import { validate } from "class-validator";
import { CreateProposalDto } from "./create-proposal.dto";

function validProposal(amount: number) {
  return Object.assign(new CreateProposalDto(), {
    leadId: "11111111-1111-4111-8111-111111111111",
    serviceProduct: "CRM setup",
    proposalAmount: amount,
    followUpAt: "2026-10-23T10:00:00.000Z",
    nextAction: "Follow up",
  });
}

test("proposal prices allow at most two decimal places", async () => {
  assert.deepEqual(await validate(validProposal(123.45)), []);
  assert.ok((await validate(validProposal(123.456))).length > 0);
});
