import * as assert from "node:assert/strict";
import { test } from "node:test";
import { PerformanceService } from "./performance.service";
import { PrismaService } from "../../prisma/prisma.service";

test("BDE performance counts only pending follow-ups whose due date has passed", async () => {
  const now = new Date();
  const overdue = new Date(now.getTime() - 60_000);
  const upcoming = new Date(now.getTime() + 86_400_000);
  const followUps = [
    {
      status: "PENDING",
      dueAt: overdue,
      lead: { assignedBdeId: "bde-1" },
    },
    {
      status: "PENDING",
      dueAt: upcoming,
      lead: { assignedBdeId: "bde-1" },
    },
    {
      status: "COMPLETED",
      dueAt: overdue,
      lead: { assignedBdeId: "bde-1" },
    },
  ];
  const prisma = {
    user: {
      findMany: async () => [{ id: "bde-1", fullName: "BDE One" }],
    },
    lead: {
      findMany: async () => [],
    },
    activity: {
      findMany: async () => [
        {
          type: "CONTACT",
          leadId: "lead-1",
          lead: { assignedBdeId: "bde-1" },
        },
        {
          type: "CONTACT",
          leadId: "lead-1",
          lead: { assignedBdeId: "bde-1" },
        },
        {
          type: "QUALIFICATION",
          leadId: "lead-2",
          lead: { assignedBdeId: "bde-1" },
        },
      ],
    },
    meeting: {
      findMany: async () => [],
    },
    proposal: {
      findMany: async () => [],
    },
    negotiation: {
      findMany: async () => [],
    },
    followUp: {
      findMany: async () => followUps,
    },
  } as unknown as PrismaService;
  const service = new PerformanceService(prisma);

  const result = await service.summary(
    new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    now.toISOString(),
    { sub: "manager-1", role: "ADMIN" },
  );

  assert.equal(result.bdes[0].overdueFollowUps, 1);
  assert.equal(result.bdes[0].contacted, 1);
  assert.equal(result.bdes[0].interested, 1);
});
