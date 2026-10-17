import * as assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  ACTIVE_LEAD_WORK_CONFLICT,
  assertLeadHasNoOtherActiveWork,
} from "./active-lead-work";

function transactionMock(overrides: Record<string, unknown> = {}) {
  const queries: Record<string, unknown>[] = [];
  const tx = {
    $queryRaw: async () => [],
    followUp: {
      findFirst: async (args: Record<string, unknown>) => {
        queries.push(args);
        return null;
      },
    },
    callMessage: {
      findFirst: async (args: Record<string, unknown>) => {
        queries.push(args);
        return null;
      },
    },
    meeting: {
      findFirst: async (args: Record<string, unknown>) => {
        queries.push(args);
        return null;
      },
    },
    ...overrides,
  };
  return { tx: tx as unknown as Prisma.TransactionClient, queries };
}

test("blocks creation when a lead already has a pending task", async () => {
  const { tx } = transactionMock({
    followUp: {
      findFirst: async () => ({ id: "existing-task" }),
    },
  });

  await assert.rejects(
    assertLeadHasNoOtherActiveWork(tx, "lead-1"),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === ACTIVE_LEAD_WORK_CONFLICT,
  );
});

test("blocks creation when a lead already has a pending call or meeting", async () => {
  const conflictSources = [
    { callMessage: { findFirst: async () => ({ id: "existing-call" }) } },
    { meeting: { findFirst: async () => ({ id: "existing-meeting" }) } },
  ];

  for (const source of conflictSources) {
    const { tx } = transactionMock(source);
    await assert.rejects(
      assertLeadHasNoOtherActiveWork(tx, "lead-1"),
      (error: unknown) =>
        error instanceof BadRequestException &&
        error.message === ACTIVE_LEAD_WORK_CONFLICT,
    );
  }
});

test("excludes a meeting's paired follow-up when replacing the meeting", async () => {
  const { tx, queries } = transactionMock();

  await assertLeadHasNoOtherActiveWork(tx, "lead-1", {
    meetingId: "meeting-1",
  });

  const followUpQuery = queries[0] as {
    where: { AND: Array<Record<string, unknown>> };
  };
  assert.deepEqual(followUpQuery.where.AND.at(-1), {
    OR: [
      { meetingId: null },
      { meetingId: { not: "meeting-1" } },
    ],
  });
});
