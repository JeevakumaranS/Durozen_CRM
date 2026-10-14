import * as assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { FollowUpStatus, LeadStage } from "@prisma/client";
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
  assert.equal(conditions.length, 6);
  assert.deepEqual(conditions[0], { lead: { assignedBdeId: bde.sub } });
  assert.ok(conditions.some((condition) => "OR" in condition));
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
        condition.status === FollowUpStatus.COMPLETED,
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
    dueAt: new Date("2026-10-13T10:00:00Z"),
    nextAction: "Call the customer",
    remarks: null,
    lead: {
      stage: LeadStage.CONTACTED,
      followUpAt: new Date("2026-10-13T10:00:00Z"),
      nextAction: "Call the customer",
    },
  };
  const service = new FollowUpsService({
    followUp: { findFirst: async () => existing },
    $transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
      operation({
        followUp: {
          updateMany: async () => ({ count: 0 }),
          create: async () => {
            successorCreated = true;
          },
        },
        lead: { update: async () => undefined },
      }),
  } as unknown as PrismaService);

  await assert.rejects(
    service.update(
      existing.id,
      {
        status: FollowUpStatus.RESCHEDULED,
        dueAt: "2026-10-14T10:00:00Z",
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
    dueAt: new Date("2026-10-13T10:00:00Z"),
    nextAction: "Call the customer",
    remarks: null,
    type: "Call",
    lead: {
      stage: LeadStage.CONTACTED,
      followUpAt: new Date("2026-10-13T10:00:00Z"),
      nextAction: "Call the customer",
    },
  };
  const service = new FollowUpsService({
    followUp: { findFirst: async () => existing },
    $transaction: async (operation: (tx: unknown) => Promise<unknown>) =>
      operation({
        followUp: {
          updateMany: async () => ({ count: 1 }),
          create: async (args: { data: Record<string, unknown> }) => {
            successorCount += 1;
            successor = args.data;
            return args.data;
          },
          findUniqueOrThrow: async () => ({ id: existing.id }),
        },
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
      dueAt: "2026-10-14T10:00:00Z",
      nextAction: "Call the customer again",
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
