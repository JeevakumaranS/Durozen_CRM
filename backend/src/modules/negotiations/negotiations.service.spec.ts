import * as assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { LeadStage, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { StageTransitionService } from "../pipeline/stage-transition.service";
import { NegotiationsService } from "./negotiations.service";

const admin = { sub: "admin-1", role: "ADMIN" };
const negotiation = {
  id: "negotiation-1",
  leadId: "lead-1",
  negotiatedAmount: 950,
  originalProposalAmount: 1200,
  responseSavedAt: null,
  lead: { stage: LeadStage.NEGOTIATION },
};
const transitions = {
  assertAllowed: () => undefined,
  canTransition: () => true,
} as StageTransitionService;

test("saving a negotiation outcome closes the lead without requiring a customer response", async () => {
  let responseGuard: unknown;
  let leadUpdate: { data: Record<string, unknown> } | undefined;
  let negotiationUpdate: { data: Record<string, unknown> } | undefined;
  const createdActivities: { data: Record<string, unknown> }[] = [];
  const service = new NegotiationsService(
    {
      negotiation: {
        findFirst: async () => negotiation,
      },
      $transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
        operation({
          $queryRaw: async () => [],
          negotiation: {
            updateMany: async (args: unknown) => {
              responseGuard = args;
              return { count: 1 };
            },
            update: async (args: { data: Record<string, unknown> }) => {
              negotiationUpdate = args;
              return { ...negotiation, ...args.data };
            },
          },
          lead: {
            update: async (args: { data: Record<string, unknown> }) => {
              leadUpdate = args;
            },
          },
          proposal: {
            findFirst: async () => ({
              finalAmount: 1200,
              serviceProduct: "CRM setup",
            }),
          },
          activity: {
            create: async (args: { data: Record<string, unknown> }) => {
              createdActivities.push(args);
            },
          },
        }),
    } as unknown as PrismaService,
    transitions,
  );

  await service.update(
    negotiation.id,
    {
      nextAction: "Won",
      expectedTimeline: "Within 30 days",
      paymentStatus: "Advance Payment",
      advanceAmount: 250,
    },
    admin,
  );

  assert.deepEqual(
    (responseGuard as { where: Record<string, unknown> }).where,
    { id: negotiation.id, responseSavedAt: null },
  );
  const responseData = (responseGuard as {
    data: Record<string, unknown>;
  }).data;
  assert.equal(responseData.customerResponse, undefined);
  assert.ok(responseData.responseSavedAt instanceof Date);
  assert.equal(leadUpdate?.data.stage, LeadStage.WON);
  assert.equal(leadUpdate?.data.finalDealValue, negotiation.negotiatedAmount);
  assert.equal(leadUpdate?.data.paymentStatus, "Advance Payment");
  assert.equal(leadUpdate?.data.advanceAmount, 250);
  assert.equal(
    (leadUpdate?.data.paidAmount as Prisma.Decimal).toNumber(),
    250,
  );
  assert.equal(leadUpdate?.data.confirmedAt instanceof Date, true);
  assert.equal(
    negotiationUpdate?.data.expectedTimeline,
    "Within 30 days",
  );
  assert.equal(negotiationUpdate?.data.paymentStatus, "Advance Payment");
  assert.equal(negotiationUpdate?.data.advanceAmount, 250);
  assert.equal(negotiationUpdate?.data.confirmedAt instanceof Date, true);
  assert.deepEqual(createdActivities[0].data, {
    leadId: negotiation.leadId,
    userId: admin.sub,
    type: "DEAL_WON",
    description: `Deal won for ${negotiation.negotiatedAmount}`,
    outcome: "Payment status: Advance Payment",
    expectedTimeline: "Within 30 days",
  });
  assert.deepEqual(
    {
      leadId: createdActivities[1].data.leadId,
      userId: createdActivities[1].data.userId,
      type: createdActivities[1].data.type,
      description: createdActivities[1].data.description,
      outcome: createdActivities[1].data.outcome,
      paymentStatus: createdActivities[1].data.paymentStatus,
    },
    {
    leadId: negotiation.leadId,
    userId: admin.sub,
    type: "PAYMENT_RECEIVED",
    description: "Advance Payment recorded",
    outcome: "Received ₹250.00; paid ₹250.00 of ₹950.00; balance ₹700.00",
    paymentStatus: "Advance Payment",
    },
  );
  assert.equal(
    (createdActivities[1].data.paymentAmount as Prisma.Decimal).toNumber(),
    250,
  );
  assert.equal(
    (createdActivities[1].data.paymentTotal as Prisma.Decimal).toNumber(),
    250,
  );
  assert.equal(
    (createdActivities[1].data.paymentBalance as Prisma.Decimal).toNumber(),
    700,
  );
});

test("a concurrent negotiation outcome save is rejected without closing the lead", async () => {
  let leadUpdated = false;
  const service = new NegotiationsService(
    {
      negotiation: {
        findFirst: async () => negotiation,
      },
      $transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
        operation({
          $queryRaw: async () => [],
          negotiation: {
            updateMany: async () => ({ count: 0 }),
          },
          lead: {
            update: async () => {
              leadUpdated = true;
            },
          },
        }),
    } as unknown as PrismaService,
    transitions,
  );

  await assert.rejects(
    service.update(
      negotiation.id,
      {
        nextAction: "Won",
        expectedTimeline: "Within 30 days",
        paymentStatus: "Not Paid",
      },
      admin,
    ),
    BadRequestException,
  );
  assert.equal(leadUpdated, false);
});

test("a negotiation can be marked lost without a customer response", async () => {
  let leadUpdate: { data: Record<string, unknown> } | undefined;
  const service = new NegotiationsService(
    {
      negotiation: {
        findFirst: async () => negotiation,
      },
      $transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
        operation({
          $queryRaw: async () => [],
          negotiation: {
            updateMany: async () => ({ count: 1 }),
            update: async (args: { data: Record<string, unknown> }) => ({
              ...negotiation,
              ...args.data,
            }),
          },
          lead: {
            update: async (args: { data: Record<string, unknown> }) => {
              leadUpdate = args;
            },
          },
        }),
    } as unknown as PrismaService,
    transitions,
  );

  await service.update(
    negotiation.id,
    { nextAction: "Lost", lostReason: "Price" },
    admin,
  );

  assert.equal(leadUpdate?.data.stage, LeadStage.LOST);
});

test("a Won negotiation response requires expected timeline and payment details", async () => {
  const service = new NegotiationsService(
    {
      negotiation: {
        findFirst: async () => negotiation,
      },
    } as unknown as PrismaService,
    transitions,
  );

  await assert.rejects(
    service.update(
      negotiation.id,
      {
        nextAction: "Won",
      },
      admin,
    ),
    BadRequestException,
  );
});

test("an already-saved negotiation response can be edited without changing its outcome", async () => {
  let negotiationUpdate: { data: Record<string, unknown> } | undefined;
  let leadUpdated = false;
  const savedNegotiation = {
    ...negotiation,
    customerResponse: "Customer is reviewing the revised amount",
    nextAction: "Won",
    responseSavedAt: new Date(),
  };
  const service = new NegotiationsService(
    {
      negotiation: {
        findFirst: async () => savedNegotiation,
      },
      $transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
        operation({
          negotiation: {
            update: async (args: { data: Record<string, unknown> }) => {
              negotiationUpdate = args;
              return { ...savedNegotiation, ...args.data };
            },
          },
          lead: {
            update: async () => {
              leadUpdated = true;
            },
          },
        }),
    } as unknown as PrismaService,
    transitions,
  );

  await service.update(
    negotiation.id,
    { customerResponse: "Customer accepted the revised amount" },
    admin,
  );

  assert.equal(
    negotiationUpdate?.data.customerResponse,
    "Customer accepted the revised amount",
  );
  assert.equal(negotiationUpdate?.data.nextAction, undefined);
  assert.equal(leadUpdated, false);
});
