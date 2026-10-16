import * as assert from "node:assert/strict";
import { test } from "node:test";
import { LeadStage } from "@prisma/client";
import { canTransition } from "./stage-rules";

test("allows backward movement between active pipeline stages", () => {
  assert.equal(canTransition(LeadStage.NEGOTIATION, LeadStage.PROPOSAL), true);
  assert.equal(canTransition(LeadStage.PROPOSAL, LeadStage.MEETING), true);
  assert.equal(canTransition(LeadStage.CONTACTED, LeadStage.NEW_LEAD), true);
});

test("preserves existing forward stage transitions", () => {
  assert.equal(canTransition(LeadStage.CONTACTED, LeadStage.MEETING), true);
  assert.equal(canTransition(LeadStage.NEW_LEAD, LeadStage.INTERESTED), true);
  assert.equal(canTransition(LeadStage.NEW_LEAD, LeadStage.PROPOSAL), false);
});

test("allows a customer to accept a proposal without entering negotiation", () => {
  assert.equal(canTransition(LeadStage.PROPOSAL, LeadStage.WON), true);
});

test("keeps won and lost leads terminal", () => {
  assert.equal(canTransition(LeadStage.WON, LeadStage.NEGOTIATION), false);
  assert.equal(canTransition(LeadStage.LOST, LeadStage.CONTACTED), false);
  assert.equal(canTransition(LeadStage.WON, LeadStage.LOST), false);
});
