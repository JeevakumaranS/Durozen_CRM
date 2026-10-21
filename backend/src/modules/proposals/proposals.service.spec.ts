import * as assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { LeadStage } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { StageTransitionService } from "../pipeline/stage-transition.service";
import { ProposalsService } from "./proposals.service";

const admin = { sub: "admin-1", role: "ADMIN" };
const proposal = {
  id: "proposal-1",
  leadId: "lead-1",
  finalAmount: 1200,
  serviceProduct: "CRM setup",
  responseSavedAt: null,
  lead: { stage: LeadStage.PROPOSAL },
};

test("saving a proposal response records it once and advances the lead", async () => {
  let responseGuard: unknown;
  let leadUpdate: { data: Record<string, unknown> } | undefined;
  let negotiationCreate: { data: Record<string, unknown> } | undefined;
  let pendingFollowUpReclassification: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  } | undefined;
  let negotiationFollowUp: { data: Record<string, unknown> } | undefined;
  const service = new ProposalsService(
    {
      proposal: {
        findFirst: async () => proposal,
      },
      $transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
        operation({
          proposal: {
            updateMany: async (args: unknown) => {
              responseGuard = args;
              return { count: 1 };
            },
            update: async ({ data }: { data: Record<string, unknown> }) => ({
              ...proposal,
              ...data,
            }),
          },
          lead: {
            update: async (args: { data: Record<string, unknown> }) => {
              leadUpdate = args;
            },
          },
          negotiation: {
            create: async (args: { data: Record<string, unknown> }) => {
              negotiationCreate = args;
              return { id: "negotiation-1", ...args.data };
            },
          },
          followUp: {
            updateMany: async (args: {
              where: Record<string, unknown>;
              data: Record<string, unknown>;
            }) => {
              pendingFollowUpReclassification = args;
              return { count: 0 };
            },
            create: async (args: { data: Record<string, unknown> }) => {
              negotiationFollowUp = args;
              return { id: "negotiation-follow-up-1", ...args.data };
            },
          },
          $executeRaw: async () => 1,
        }),
    } as unknown as PrismaService,
    {
      assertAllowed: () => undefined,
      canTransition: () => true,
    } as StageTransitionService,
  );

  await service.update(
    proposal.id,
    {
      customerResponse: "Interested in pricing",
      customerExpectedAmount: 1000,
      nextAction: "Negotiation",
    },
    admin,
  );

  assert.deepEqual(
    (responseGuard as { where: Record<string, unknown> }).where,
    { id: proposal.id, responseSavedAt: null },
  );
  assert.equal(
    (responseGuard as { data: { customerResponse: string } }).data
      .customerResponse,
    "Interested in pricing",
  );
  assert.ok(
    (responseGuard as { data: { responseSavedAt: Date } }).data.responseSavedAt
      instanceof Date,
  );
  assert.equal(leadUpdate?.data.stage, LeadStage.NEGOTIATION);
  assert.equal(leadUpdate?.data.nextAction, "Follow up on negotiation");
  assert.equal(negotiationCreate?.data.customerExpectedAmount, 1000);
  assert.equal(pendingFollowUpReclassification?.where.status, "PENDING");
  assert.equal(pendingFollowUpReclassification?.data.type, "Negotiation");
  assert.equal(
    pendingFollowUpReclassification?.data.nextAction,
    "Follow up on negotiation",
  );
  assert.equal(negotiationFollowUp?.data.type, "Negotiation");
});

test("a concurrent proposal response save is rejected", async () => {
  let leadUpdated = false;
  const service = new ProposalsService(
    {
      proposal: {
        findFirst: async () => proposal,
      },
      $transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
        operation({
          proposal: {
            updateMany: async () => ({ count: 0 }),
          },
          lead: {
            update: async () => {
              leadUpdated = true;
            },
          },
        }),
    } as unknown as PrismaService,
    {
      assertAllowed: () => undefined,
      canTransition: () => true,
    } as StageTransitionService,
  );

  await assert.rejects(
    service.update(
      proposal.id,
      {
        customerResponse: "Interested",
        customerExpectedAmount: 1000,
        nextAction: "Negotiation",
      },
      admin,
    ),
    BadRequestException,
  );
  assert.equal(leadUpdated, false);
});

test("a proposal cannot move to negotiation without the customer's expected amount", async () => {
  const service = new ProposalsService(
    {
      proposal: {
        findFirst: async () => proposal,
      },
    } as unknown as PrismaService,
    {
      assertAllowed: () => undefined,
      canTransition: () => true,
    } as StageTransitionService,
  );

  await assert.rejects(
    service.update(
      proposal.id,
      { customerResponse: "Interested", nextAction: "Negotiation" },
      admin,
    ),
    BadRequestException,
  );
});

test("an already-saved proposal response can be edited without changing its outcome", async () => {
  let proposalUpdate: { data: Record<string, unknown> } | undefined;
  let leadUpdated = false;
  const savedProposal = {
    ...proposal,
    customerResponse: "Reviewing the quote",
    responseSavedAt: new Date(),
  };
  const service = new ProposalsService(
    {
      proposal: {
        findFirst: async () => savedProposal,
      },
      $transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
        operation({
          proposal: {
            update: async (args: { data: Record<string, unknown> }) => {
              proposalUpdate = args;
              return { ...savedProposal, ...args.data };
            },
          },
          lead: {
            update: async () => {
              leadUpdated = true;
            },
          },
        }),
    } as unknown as PrismaService,
    {
      assertAllowed: () => undefined,
      canTransition: () => true,
    } as StageTransitionService,
  );

  await service.update(
    proposal.id,
    { customerResponse: "Customer approved the updated quote" },
    admin,
  );

  assert.deepEqual(proposalUpdate?.data, {
    customerResponse: "Customer approved the updated quote",
    responseSavedAt: undefined,
    followUpAt: undefined,
    remarks: undefined,
  });
  assert.equal(leadUpdated, false);
});
