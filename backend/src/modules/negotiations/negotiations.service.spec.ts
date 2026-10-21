import * as assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { LeadStage } from "@prisma/client";
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

test("saving a negotiation outcome closes the lead and records the response once", async () => {
  let responseGuard: unknown;
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
            updateMany: async (args: unknown) => {
              responseGuard = args;
              return { count: 1 };
            },
            update: async ({ data }: { data: Record<string, unknown> }) => ({
              ...negotiation,
              ...data,
            }),
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
        }),
    } as unknown as PrismaService,
    transitions,
  );

  await service.update(
    negotiation.id,
    {
      customerResponse: "Customer accepted the revised price",
      nextAction: "Won",
    },
    admin,
  );

  assert.deepEqual(
    (responseGuard as { where: Record<string, unknown> }).where,
    { id: negotiation.id, responseSavedAt: null },
  );
  assert.equal(
    (responseGuard as { data: { customerResponse: string } }).data
      .customerResponse,
    "Customer accepted the revised price",
  );
  assert.equal(leadUpdate?.data.stage, LeadStage.WON);
  assert.equal(leadUpdate?.data.finalDealValue, negotiation.negotiatedAmount);
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
      { customerResponse: "Accepted", nextAction: "Won" },
      admin,
    ),
    BadRequestException,
  );
  assert.equal(leadUpdated, false);
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
