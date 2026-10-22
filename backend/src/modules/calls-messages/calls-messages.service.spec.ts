import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { FollowUpStatus, LeadStage } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CallsMessagesService } from "./calls-messages.service";

test("completing a call from the pipeline completes the existing pending call and updates the lead", async () => {
  let updatedCall: { data: Record<string, unknown> } | undefined;
  let createdActivity: { data: Record<string, unknown> } | undefined;
  let updatedLead: { data: Record<string, unknown> } | undefined;

  const service = new CallsMessagesService({
    lead: {
      findFirst: async () => ({ id: "lead-1", stage: LeadStage.NEW_LEAD }),
    },
    callMessage: {
      findFirst: async () => ({
        id: "call-1",
        leadId: "lead-1",
        contactMethod: "Phone Call",
        description: null,
        lead: { id: "lead-1", stage: LeadStage.NEW_LEAD },
      }),
    },
    $transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
      operation({
        $queryRaw: async () => [],
        callMessage: {
          updateMany: async (args: { data: Record<string, unknown> }) => {
            updatedCall = args;
            return { count: 1 };
          },
          findUniqueOrThrow: async () => ({ id: "call-1" }),
        },
        activity: {
          create: async (args: { data: Record<string, unknown> }) => {
            createdActivity = args;
            return args.data;
          },
        },
        lead: {
          update: async (args: { data: Record<string, unknown> }) => {
            updatedLead = args;
            return args.data;
          },
        },
      }),
  } as unknown as PrismaService);

  await service.completeLead(
    {
      leadId: "lead-1",
      contactMethod: "Phone Call",
      contactDate: "2026-10-21T00:00:00.000Z",
      responseAction: "Decision pending",
      customerResponse: "Asked for more time",
      requirement: "CRM implementation",
    },
    { sub: "admin-1", role: "ADMIN" },
  );

  assert.equal(updatedCall?.data.status, FollowUpStatus.COMPLETED);
  assert.equal(createdActivity?.data.type, "CONTACT");
  assert.equal(updatedLead?.data.stage, LeadStage.CONTACTED);
});

test("sales managers cannot complete lead calls", async () => {
  const service = new CallsMessagesService({} as PrismaService);

  await assert.rejects(
    service.completeLead(
      {
        leadId: "lead-1",
        contactMethod: "Phone Call",
        contactDate: "2026-10-21T00:00:00.000Z",
        responseAction: "Decision pending",
        customerResponse: "Asked for more time",
        requirement: "CRM implementation",
      },
      { sub: "manager-1", role: "SALES_MANAGER" },
    ),
    ForbiddenException,
  );
});
