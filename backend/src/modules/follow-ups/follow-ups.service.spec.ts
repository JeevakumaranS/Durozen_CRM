import * as assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { FollowUpStatus, LeadStage, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { FollowUpsService } from "./follow-ups.service";

const bde = { sub: "bde-1", role: "BDE" };

test("lists follow-ups with assigned-BDE scope and requested filters", async () => {
  let query: unknown;
  const service = new FollowUpsService({
    followUp: {
      findMany: async (args: unknown) => {
        query = args;
        return [];
      },
    },
  } as unknown as PrismaService);

  await service.list(
    {
      scope: "overdue",
      search: "customer",
      type: "Call",
      assignedBdeId: "bde-1",
      from: "2026-10-01",
      to: "2026-10-31",
    },
    bde,
  );

  assert.ok(query);
  const conditions = (
    query as { where: { AND: Array<Record<string, unknown>> } }
  ).where.AND;
  assert.equal(conditions.length, 8);
  assert.deepEqual(conditions[0], { lead: { assignedBdeId: bde.sub } });
  assert.ok(conditions.some((condition) => "OR" in condition));
});

test("hides pending proposal follow-up duplicates when the matching task is completed", async () => {
  let query: unknown;
  const service = new FollowUpsService({
    followUp: {
      findMany: async (args: unknown) => {
        query = args;
        return [];
      },
    },
  } as unknown as PrismaService);

  await service.list({}, bde);

  const conditions = (
    query as { where: { AND: Array<Record<string, unknown>> } }
  ).where.AND;
  assert.deepEqual(
    conditions.find((condition) => "NOT" in condition),
    {
      NOT: {
        status: FollowUpStatus.PENDING,
        type: "Proposal Follow-up",
        nextAction: "Follow up on proposal",
        lead: {
          followUps: {
            some: {
              status: FollowUpStatus.COMPLETED,
              type: "Proposal Follow-up",
              nextAction: "Follow up on proposal",
            },
          },
        },
      },
    },
  );
});

test("pending response filter only includes proposal and negotiation records without saved responses", async () => {
  let query: unknown;
  const service = new FollowUpsService({
    followUp: {
      findMany: async (args: unknown) => {
        query = args;
        return [];
      },
    },
  } as unknown as PrismaService);

  await service.list({ pendingResponse: "true" }, bde);

  const conditions = (
    query as { where: { AND: Array<Record<string, unknown>> } }
  ).where.AND;
  const responseFilter = conditions.find(
    (condition) => "OR" in condition,
  ) as {
    OR: Array<Record<string, unknown>>;
  };
  assert.deepEqual(responseFilter.OR, [
    {
      AND: [
        { type: "Proposal Follow-up" },
        {
          OR: [
            { proposal: { is: { responseSavedAt: null } } },
            {
              proposalId: null,
              lead: { proposals: { some: { responseSavedAt: null } } },
            },
          ],
        },
      ],
    },
    {
      AND: [
        { type: "Negotiation" },
        {
          OR: [
            { negotiation: { is: { responseSavedAt: null } } },
            {
              negotiationId: null,
              lead: { negotiations: { some: { responseSavedAt: null } } },
            },
          ],
        },
      ],
    },
  ]);
});

test("rejects invalid pending response filter values", async () => {
  const service = new FollowUpsService({} as PrismaService);

  await assert.rejects(
    service.list({ pendingResponse: "yes" }, bde),
    BadRequestException,
  );
});

test("date-only filters cover the selected Asia/Kolkata calendar days", async () => {
  let query: unknown;
  const service = new FollowUpsService({
    followUp: {
      findMany: async (args: unknown) => {
        query = args;
        return [];
      },
    },
  } as unknown as PrismaService);

  await service.list({ from: "2026-10-13", to: "2026-10-13" }, bde);

  const conditions = (
    query as { where: { AND: Array<Record<string, unknown>> } }
  ).where.AND;
  assert.deepEqual(
    conditions.find((condition) => "dueAt" in condition),
    {
      dueAt: {
        gte: new Date("2026-10-12T18:30:00.000Z"),
        lt: new Date("2026-10-13T18:30:00.000Z"),
      },
    },
  );
});

test("rejects impossible date-only filter values", async () => {
  const service = new FollowUpsService({} as PrismaService);
  await assert.rejects(
    service.list({ from: "2026-02-30" }, bde),
    BadRequestException,
  );
});

test("date scopes remain intersected with an explicit status filter", async () => {
  let query: unknown;
  const service = new FollowUpsService({
    followUp: {
      findMany: async (args: unknown) => {
        query = args;
        return [];
      },
    },
  } as unknown as PrismaService);

  await service.list(
    { scope: "today", status: FollowUpStatus.COMPLETED },
    bde,
  );
  const conditions = (
    query as { where: { AND: Array<Record<string, unknown>> } }
  ).where.AND;
  assert.ok(
    conditions.some(
      (condition) =>
        "status" in condition &&
        condition.status === FollowUpStatus.PENDING &&
        "dueAt" in condition,
    ),
  );
  assert.ok(
    conditions.some(
      (condition) =>
        "status" in condition &&
        Array.isArray((condition.status as { in?: unknown }).in) &&
        (condition.status as { in: FollowUpStatus[] }).in.includes(
          FollowUpStatus.COMPLETED,
        ),
    ),
  );
});

test("summary returns counts from scoped database aggregate queries", async () => {
  let transactionQueries: unknown[] = [];
  const service = new FollowUpsService({
    followUp: {
      count: (args: unknown) => args,
    },
    $transaction: async (queries: unknown[]) => {
      transactionQueries = queries;
      return [2, 3, 4, 5];
    },
  } as unknown as PrismaService);

  assert.deepEqual(await service.summary(bde), {
    dueToday: 2,
    upcoming: 3,
    overdue: 4,
    completed: 5,
  });
  assert.equal(transactionQueries.length, 4);
  for (const query of transactionQueries) {
    assert.deepEqual(
      (query as { where: { lead: { assignedBdeId: string } } }).where.lead,
      { assignedBdeId: bde.sub },
    );
  }
});

test("rejects unauthorized roles for follow-up listing", async () => {
  const service = new FollowUpsService({} as PrismaService);
  await assert.rejects(
    service.list({}, { sub: "user-1", role: "UNKNOWN" }),
    ForbiddenException,
  );
});

test("Sales Manager filters remain limited to assigned team BDEs", async () => {
  let query: unknown;
  const service = new FollowUpsService({
    followUp: {
      findMany: async (args: unknown) => {
        query = args;
        return [];
      },
    },
  } as unknown as PrismaService);
  await service.list(
    { scope: "upcoming" },
    { sub: "manager-1", role: "SALES_MANAGER" },
  );
  const where = (query as { where: { AND: Array<Record<string, unknown>> } })
    .where;
  assert.deepEqual(where.AND[0], {
    lead: { assignedBde: { managerId: "manager-1" } },
  });
});

test("repeat completion of a completed follow-up does not create a successor", async () => {
  let transactionCalled = false;
  const existing = {
    id: "follow-up-1",
    status: FollowUpStatus.COMPLETED,
    leadId: "lead-1",
    lead: { stage: LeadStage.CONTACTED },
  };
  const service = new FollowUpsService({
    followUp: {
      findFirst: async () => existing,
      create: async () => {
        throw new Error("A duplicate successor was created.");
      },
    },
    $transaction: async () => {
      transactionCalled = true;
      return undefined;
    },
  } as unknown as PrismaService);

  assert.equal(
    await service.update(
      existing.id,
      { status: FollowUpStatus.COMPLETED },
      bde,
    ),
    existing,
  );
  assert.equal(transactionCalled, false);
});

test("a concurrent repeat transition cannot create a second successor", async () => {
  let successorCreated = false;
  const existing = {
    id: "follow-up-1",
    leadId: "lead-1",
    meetingId: null,
    status: FollowUpStatus.PENDING,
    dueAt: new Date(Date.now() - 86400000),
    nextAction: "Call the customer",
    remarks: null,
    lead: {
      stage: LeadStage.CONTACTED,
      followUpAt: new Date(Date.now() - 86400000),
      nextAction: "Call the customer",
    },
  };
  const service = new FollowUpsService({
    followUp: { findFirst: async () => existing },
    $transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
      operation({
        $queryRaw: async () => [],
        followUp: {
          findFirst: async () => null,
          updateMany: async () => ({ count: 0 }),
          create: async () => {
            successorCreated = true;
          },
        },
        callMessage: { findFirst: async () => null },
        meeting: { findFirst: async () => null },
        lead: { update: async () => undefined },
      }),
  } as unknown as PrismaService);

  await assert.rejects(
    service.update(
      existing.id,
      {
        status: FollowUpStatus.RESCHEDULED,
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        nextAction: "Call the customer again",
      },
      bde,
    ),
    BadRequestException,
  );
  assert.equal(successorCreated, false);
});

test("rejects a successor follow-up date that is not in the future", async () => {
  let transactionCalled = false;
  const existing = {
    id: "follow-up-1",
    leadId: "lead-1",
    status: FollowUpStatus.PENDING,
    dueAt: new Date(Date.now() - 86400000),
    nextAction: "Call the customer",
    remarks: null,
    lead: {
      stage: LeadStage.CONTACTED,
      followUpAt: new Date(Date.now() - 86400000),
      nextAction: "Call the customer",
    },
  };
  const service = new FollowUpsService({
    followUp: { findFirst: async () => existing },
    $transaction: async () => {
      transactionCalled = true;
    },
  } as unknown as PrismaService);

  await assert.rejects(
    service.update(
      existing.id,
      {
        status: FollowUpStatus.COMPLETED,
        dueAt: new Date(Date.now() - 60000).toISOString(),
        nextAction: "Send the proposal",
      },
      bde,
    ),
    BadRequestException,
  );
  assert.equal(transactionCalled, false);
});

test("rescheduling creates one successor and updates the lead next action", async () => {
  let successorCount = 0;
  let successor: Record<string, unknown> | undefined;
  let leadUpdate: Record<string, unknown> | undefined;
  const existing = {
    id: "follow-up-1",
    leadId: "lead-1",
    meetingId: "meeting-1",
    status: FollowUpStatus.PENDING,
    dueAt: new Date(Date.now() - 86400000),
    nextAction: "Call the customer",
    remarks: null,
    type: "Call",
    lead: {
      stage: LeadStage.CONTACTED,
      followUpAt: new Date(Date.now() - 86400000),
      nextAction: "Call the customer",
    },
  };
  const service = new FollowUpsService({
    followUp: { findFirst: async () => existing },
    $transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
      operation({
        $queryRaw: async () => [],
        followUp: {
          findFirst: async () => null,
          updateMany: async () => ({ count: 1 }),
          create: async (args: { data: Record<string, unknown> }) => {
            successorCount += 1;
            successor = args.data;
            return args.data;
          },
          findUniqueOrThrow: async () => ({ id: existing.id }),
        },
        callMessage: { findFirst: async () => null },
        meeting: { findFirst: async () => null },
        lead: {
          update: async (args: { data: Record<string, unknown> }) => {
            leadUpdate = args.data;
          },
        },
      }),
  } as unknown as PrismaService);

  await service.update(
    existing.id,
    {
      status: FollowUpStatus.RESCHEDULED,
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      nextAction: "Call the customer again",
      rescheduleReason: "Customer unavailable",
      remarks: "Customer requested another day.",
    },
    bde,
  );

  assert.equal(successorCount, 1);
  assert.equal(successor?.type, "Call");
  assert.equal(successor?.meetingId, "meeting-1");
  assert.equal(successor?.remarks, undefined);
  assert.equal(leadUpdate?.nextAction, "Call the customer again");
});

test("rescheduling requires a reason before changing the follow-up", async () => {
  let transactionCalled = false;
  const service = new FollowUpsService({
    followUp: {
      findFirst: async () => ({
        id: "follow-up-1",
        status: FollowUpStatus.PENDING,
        leadId: "lead-1",
        lead: {
          stage: LeadStage.CONTACTED,
          followUpAt: new Date(Date.now() - 86400000),
          nextAction: "Call the customer",
        },
      }),
    },
    $transaction: async () => {
      transactionCalled = true;
    },
  } as unknown as PrismaService);

  await assert.rejects(
    service.update(
      "follow-up-1",
      {
        status: FollowUpStatus.RESCHEDULED,
        dueAt: new Date(Date.now() + 86400000).toISOString(),
        nextAction: "Call the customer again",
      },
      bde,
    ),
    BadRequestException,
  );
  assert.equal(transactionCalled, false);
});

test("completing a follow-up records customer contact details and updates lead details", async () => {
  let activityData: Record<string, unknown> | undefined;
  const leadUpdates: Record<string, unknown>[] = [];
  const existing = {
    id: "follow-up-1",
    leadId: "lead-1",
    meetingId: null,
    status: FollowUpStatus.PENDING,
    dueAt: new Date(Date.now() - 86400000),
    nextAction: "Call the customer",
    remarks: null,
    type: "Call",
    lead: {
      stage: LeadStage.CONTACTED,
      followUpAt: new Date(Date.now() - 86400000),
      nextAction: "Call the customer",
    },
  };
  const service = new FollowUpsService({
    followUp: { findFirst: async () => existing },
    $transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
      operation({
        $queryRaw: async () => [],
        followUp: {
          findFirst: async () => null,
          updateMany: async () => ({ count: 1 }),
          create: async () => undefined,
          findUniqueOrThrow: async () => ({ id: existing.id }),
        },
        activity: {
          create: async (args: { data: Record<string, unknown> }) => {
            activityData = args.data;
          },
        },
        lead: {
          update: async (args: { data: Record<string, unknown> }) => {
            leadUpdates.push(args.data);
            return {
              id: existing.leadId,
              stage: args.data.stage ?? existing.lead.stage,
            };
          },
        },
      }),
  } as unknown as PrismaService);

  await service.update(
    existing.id,
    {
      status: FollowUpStatus.COMPLETED,
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      nextAction: "Interested",
      contactDate: "2026-10-15T00:00:00.000Z",
      contactType: "WhatsApp",
      customerResponse: "Interested in the proposal",
      nextStage: LeadStage.INTERESTED,
      requirement: "CRM setup",
      customerBudget: 125000,
      expectedTimeline: "Next month",
      remarks: "Send pricing details",
    },
    bde,
  );

  assert.equal(activityData?.type, "QUALIFICATION");
  assert.equal(activityData?.contactType, "WhatsApp");
  assert.equal(activityData?.customerResponse, "Interested in the proposal");
  assert.equal(activityData?.expectedTimeline, "Next month");
  assert.equal(
    leadUpdates.some((update) => update.nextAction === "Interested"),
    true,
  );
  assert.equal(leadUpdates.at(-1)?.requirement, "CRM setup");
  assert.equal(leadUpdates.at(-1)?.estimatedBudget, 125000);
  assert.equal(leadUpdates.at(-1)?.remarks, "Send pricing details");
  assert.equal(leadUpdates.at(-1)?.stage, LeadStage.INTERESTED);
});

test("requires requirements for Interested and Decision Pending completions", async () => {
  const existing = {
    id: "follow-up-1",
    status: FollowUpStatus.PENDING,
    leadId: "lead-1",
    lead: { stage: LeadStage.CONTACTED },
  };
  const service = new FollowUpsService({
    followUp: { findFirst: async () => existing },
  } as unknown as PrismaService);

  await assert.rejects(
    service.update(
      existing.id,
      {
        status: FollowUpStatus.COMPLETED,
        contactDate: new Date().toISOString(),
        contactType: "Phone Call",
        customerResponse: "Interested",
        nextStage: LeadStage.INTERESTED,
      },
      bde,
    ),
    BadRequestException,
  );
});

test("Not Interested completion moves the lead to Lost without follow-up details", async () => {
  let finalLeadUpdate: Record<string, unknown> | undefined;
  let cancelledCallMessages = false;
  const existing = {
    id: "follow-up-1",
    leadId: "lead-1",
    meetingId: null,
    status: FollowUpStatus.PENDING,
    dueAt: new Date(),
    nextAction: "Call the customer",
    remarks: null,
    type: "Proposal Follow-up",
    lead: {
      stage: LeadStage.CONTACTED,
      followUpAt: new Date(),
      nextAction: "Call the customer",
    },
  };
  const service = new FollowUpsService({
    followUp: { findFirst: async () => existing },
    $transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
      operation({
        $queryRaw: async () => [],
        followUp: {
          findFirst: async () => null,
          updateMany: async () => ({ count: 1 }),
          findUniqueOrThrow: async () => ({ id: existing.id }),
        },
        activity: { create: async () => undefined },
        lead: {
          update: async (args: { data: Record<string, unknown> }) => {
            finalLeadUpdate = args.data;
            return { id: existing.leadId, stage: args.data.stage };
          },
        },
        callMessage: {
          updateMany: async () => {
            cancelledCallMessages = true;
            return { count: 1 };
          },
        },
      }),
  } as unknown as PrismaService);

  await service.update(
    existing.id,
    {
      status: FollowUpStatus.COMPLETED,
      contactDate: new Date().toISOString(),
      contactType: "Phone Call",
      nextStage: LeadStage.LOST,
    },
    bde,
  );

  assert.equal(finalLeadUpdate?.stage, LeadStage.LOST);
  assert.equal(finalLeadUpdate?.lostReason, "Not Interested");
  assert.equal(finalLeadUpdate?.nextAction, null);
  assert.equal(finalLeadUpdate?.followUpAt, null);
  assert.equal(cancelledCallMessages, true);
});

test("completing a negotiation follow-up marks the current task without creating another", async () => {
  let negotiationUpdate: Record<string, unknown> | undefined;
  const leadUpdates: Record<string, unknown>[] = [];
  let followUpAction: string | undefined;
  let completedStatus: FollowUpStatus | undefined;
  let createdFollowUp = false;
  const existing = {
    id: "follow-up-1",
    leadId: "lead-1",
    negotiationId: "negotiation-1",
    negotiation: { id: "negotiation-1" },
    meetingId: null,
    status: FollowUpStatus.PENDING,
    dueAt: new Date(),
    nextAction: "Follow up on negotiation",
    remarks: null,
    type: "Negotiation",
    lead: {
      stage: LeadStage.NEGOTIATION,
      followUpAt: new Date(),
      nextAction: "Follow up on negotiation",
    },
  };
  const service = new FollowUpsService({
    followUp: { findFirst: async () => existing },
    $transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
      operation({
        $queryRaw: async () => [],
        followUp: {
          updateMany: async (args: {
            data: Record<string, unknown>;
          }) => {
            completedStatus = args.data.status as FollowUpStatus;
            if (args.data.nextAction) {
              followUpAction = args.data.nextAction as string;
            }
            return { count: 1 };
          },
          create: async () => {
            createdFollowUp = true;
          },
          findUniqueOrThrow: async () => ({ id: existing.id }),
        },
        negotiation: {
          update: async (args: { data: Record<string, unknown> }) => {
            negotiationUpdate = args.data;
          },
        },
        activity: { create: async () => undefined },
        lead: {
          update: async (args: { data: Record<string, unknown> }) => {
            leadUpdates.push(args.data);
            return { id: existing.leadId, stage: args.data.stage };
          },
        },
        $executeRaw: async () => 1,
        callMessage: { updateMany: async () => ({ count: 1 }) },
      }),
  } as unknown as PrismaService);

  await service.update(
    existing.id,
    {
      status: FollowUpStatus.COMPLETED,
      nextAction: "Follow up on negotiation",
      negotiatedAmount: 1050,
    },
    bde,
  );

  assert.equal(completedStatus, FollowUpStatus.COMPLETED);
  assert.equal(followUpAction, "Follow up on negotiation");
  assert.equal(negotiationUpdate?.negotiatedAmount, 1050);
  assert.equal(createdFollowUp, false);
  assert.equal(
    leadUpdates.some((update) => update.stage === LeadStage.NEGOTIATION),
    true,
  );
  assert.equal(leadUpdates.at(-1)?.nextAction, null);
  assert.equal(leadUpdates.at(-1)?.followUpAt, null);
});

test("requires the negotiated amount when completing a negotiation", async () => {
  const existing = {
    id: "follow-up-1",
    status: FollowUpStatus.PENDING,
    type: "Negotiation",
    lead: { stage: LeadStage.NEGOTIATION },
  };
  const service = new FollowUpsService({
    followUp: { findFirst: async () => existing },
  } as unknown as PrismaService);

  await assert.rejects(
    service.update(
      existing.id,
      {
        status: FollowUpStatus.COMPLETED,
        nextStage: LeadStage.NEGOTIATION,
        nextAction: "Follow up on negotiation",
      },
      bde,
    ),
    BadRequestException,
  );
});

test("completing an interested follow-up with meeting details creates one meeting and linked follow-up", async () => {
  let meetingData: Record<string, unknown> | undefined;
  let meetingActivity: Record<string, unknown> | undefined;
  let meetingFollowUp: Record<string, unknown> | undefined;
  const leadUpdates: Record<string, unknown>[] = [];
  const existing = {
    id: "follow-up-1",
    leadId: "lead-1",
    meetingId: null,
    status: FollowUpStatus.PENDING,
    dueAt: new Date(Date.now() - 86400000),
    nextAction: "Call the customer",
    remarks: null,
    type: "Call",
    lead: {
      stage: LeadStage.CONTACTED,
      followUpAt: new Date(Date.now() - 86400000),
      nextAction: "Call the customer",
    },
  };
  const service = new FollowUpsService({
    followUp: { findFirst: async () => existing },
    $transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
      operation({
        $queryRaw: async () => [],
        followUp: {
          findFirst: async () => null,
          updateMany: async () => ({ count: 1 }),
          create: async (args: { data: Record<string, unknown> }) => {
            meetingFollowUp = args.data;
          },
          findUniqueOrThrow: async () => ({ id: existing.id }),
        },
        callMessage: { findFirst: async () => null },
        meeting: {
          findFirst: async () => null,
          create: async (args: { data: Record<string, unknown> }) => {
            meetingData = args.data;
            return {
              id: "meeting-1",
              type: args.data.type,
              meetingAt: args.data.meetingAt,
            };
          },
        },
        activity: {
          create: async (args: { data: Record<string, unknown> }) => {
            if (args.data.type === "MEETING_SCHEDULED") {
              meetingActivity = args.data;
            }
          },
        },
        lead: {
          update: async (args: { data: Record<string, unknown> }) => {
            leadUpdates.push(args.data);
            return {
              id: existing.leadId,
              stage: args.data.stage ?? existing.lead.stage,
            };
          },
        },
      }),
  } as unknown as PrismaService);

  const meetingAt = new Date(Date.now() + 86400000);
  await service.update(
    existing.id,
    {
      status: FollowUpStatus.COMPLETED,
      dueAt: meetingAt.toISOString(),
      nextAction: "Attend scheduled meeting",
      contactDate: new Date().toISOString(),
      contactType: "Phone Call",
      customerResponse: "Interested in a product demo",
      requirement: "Product demonstration",
      nextStage: LeadStage.INTERESTED,
      scheduleMeeting: true,
      meetingAt: meetingAt.toISOString(),
      meetingType: "Product Demo",
    },
    bde,
  );

  assert.equal(meetingData?.leadId, existing.leadId);
  assert.equal(meetingData?.type, "Product Demo");
  assert.equal(meetingActivity?.meetingId, "meeting-1");
  assert.equal(meetingFollowUp?.meetingId, "meeting-1");
  assert.equal(
    (meetingFollowUp?.dueAt as Date).getTime(),
    meetingAt.getTime(),
  );
  assert.equal(meetingFollowUp?.nextAction, "Attend scheduled meeting");
  assert.equal(leadUpdates.at(-1)?.stage, LeadStage.INTERESTED);
  assert.equal(
    (leadUpdates.find((update) => update.followUpAt)?.followUpAt as Date).getTime(),
    meetingAt.getTime(),
  );
  assert.equal(
    leadUpdates.find((update) => update.nextAction)?.nextAction,
    "Attend scheduled meeting",
  );
});

test("proposal follow-up completion saves a proposal without creating a successor task", async () => {
  let proposalData: Record<string, unknown> | undefined;
  let linkedProposalId: string | undefined;
  let successor: Record<string, unknown> | undefined;
  let proposalActivity: Record<string, unknown> | undefined;
  const leadUpdates: Record<string, unknown>[] = [];
  const existing = {
    id: "follow-up-proposal",
    leadId: "lead-1",
    meetingId: null,
    status: FollowUpStatus.PENDING,
    dueAt: new Date(Date.now() - 86400000),
    nextAction: "Prepare a proposal",
    remarks: null,
    type: "Proposal Follow-up",
    lead: {
      leadNumber: "DZN-2026-00042",
      stage: LeadStage.MEETING,
      followUpAt: new Date(Date.now() - 86400000),
      nextAction: "Prepare a proposal",
    },
  };
  const service = new FollowUpsService({
    followUp: { findFirst: async () => existing },
    $transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
      operation({
        $queryRaw: async () => [],
        followUp: {
          findFirst: async () => null,
          updateMany: async () => ({ count: 1 }),
          update: async (args: { data: { proposalId: string } }) => {
            linkedProposalId = args.data.proposalId;
          },
          create: async (args: { data: Record<string, unknown> }) => {
            assert.fail("A successor task should not be created.");
            successor = args.data;
          },
          findUniqueOrThrow: async () => ({ id: existing.id }),
        },
        callMessage: { findFirst: async () => null },
        meeting: { findFirst: async () => null },
        proposal: {
          findMany: async () => [],
          create: async (args: { data: Record<string, unknown> }) => {
            proposalData = args.data;
            return { id: "proposal-1" };
          },
        },
        activity: {
          create: async (args: { data: Record<string, unknown> }) => {
            proposalActivity = args.data;
          },
        },
        lead: {
          update: async (args: { data: Record<string, unknown> }) => {
            leadUpdates.push(args.data);
            return { id: existing.leadId, stage: args.data.stage };
          },
        },
      }),
  } as unknown as PrismaService);
  const nextFollowUpAt = new Date(Date.now() + 86400000);
  const proposalDate = new Date().toISOString();

  await service.update(
    existing.id,
    {
      status: FollowUpStatus.COMPLETED,
      nextStage: LeadStage.PROPOSAL,
      proposalDate,
      serviceProduct: "CRM setup",
      proposalAmount: 125000,
      discount: 5000,
      dueAt: nextFollowUpAt.toISOString(),
    },
    bde,
  );

  assert.equal(proposalData?.leadId, existing.leadId);
  assert.equal(proposalData?.serviceProduct, "CRM setup");
  assert.equal(
    (proposalData?.proposalAmount as Prisma.Decimal).toNumber(),
    125000,
  );
  assert.equal((proposalData?.discount as Prisma.Decimal).toNumber(), 5000);
  assert.equal((proposalData?.finalAmount as Prisma.Decimal).toNumber(), 120000);
  assert.equal(proposalActivity?.type, "PROPOSAL_SENT");
  assert.equal(linkedProposalId, "proposal-1");
  assert.equal(successor, undefined);
  assert.equal(leadUpdates.at(-1)?.stage, LeadStage.PROPOSAL);
  assert.equal(leadUpdates.at(-1)?.nextAction, "Follow up on proposal");
  assert.equal(
    (leadUpdates.at(-1)?.followUpAt as Date).getTime(),
    nextFollowUpAt.getTime(),
  );
});
