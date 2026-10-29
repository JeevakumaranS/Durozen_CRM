import * as assert from "node:assert/strict";
import { test } from "node:test";
import { LeadStage, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { DashboardService } from "./dashboard.service";

test("pending counts include completed proposal and negotiation responses", async () => {
  const followUpQueries: Array<{ where: Record<string, unknown> }> = [];
  const leadScope = { assignedBdeId: "bde-1" };
  const service = new DashboardService({
    followUp: {
      count: async (query: { where: Record<string, unknown> }) => {
        followUpQueries.push(query);
        return 1;
      },
    },
    meeting: { count: async () => 0 },
    callMessage: { count: async () => 0 },
  } as unknown as PrismaService);

  const counts = await service.pendingCounts({ sub: "bde-1", role: "BDE" });

  assert.deepEqual(counts, {
    tasks: 1,
    meetings: 0,
    callsAndMessages: 0,
    proposals: 2,
    negotiations: 2,
  });
  assert.equal(followUpQueries.length, 5);
  assert.deepEqual(followUpQueries[2].where, {
    status: "COMPLETED",
    type: "Proposal Follow-up",
    lead: leadScope,
    OR: [
      { proposal: { is: { responseSavedAt: null } } },
      {
        proposalId: null,
        lead: { proposals: { some: { responseSavedAt: null } } },
      },
    ],
  });
  assert.deepEqual(followUpQueries[4].where, {
    status: "COMPLETED",
    type: "Negotiation",
    lead: leadScope,
    OR: [
      { negotiation: { is: { responseSavedAt: null } } },
      {
        negotiationId: null,
        lead: { negotiations: { some: { responseSavedAt: null } } },
      },
    ],
  });
});

test("BDE dashboard returns pipeline values scoped to assigned leads", async () => {
  let aggregateCalls = 0;
  const service = new DashboardService({
    lead: {
      groupBy: async () => [
        {
          stage: LeadStage.NEW_LEAD,
          _count: { _all: 1 },
          _sum: { estimatedBudget: new Prisma.Decimal(500) },
        },
      ],
      aggregate: async () => {
        aggregateCalls += 1;
        return {
          _sum: {
            finalDealValue: new Prisma.Decimal(0),
            estimatedBudget: new Prisma.Decimal(500),
          },
        };
      },
    },
    followUp: { count: async () => 0 },
    meeting: { count: async () => 0 },
    callMessage: { count: async () => 0 },
  } as unknown as PrismaService);

  const summary = await service.summary({
    sub: "bde-1",
    role: "BDE",
  });

  assert.equal(aggregateCalls, 4);
  assert.deepEqual(summary.pipeline, [
    { stage: LeadStage.NEW_LEAD, count: 1, value: "500" },
  ]);
  assert.equal(summary.revenue.pipeline, "500");
});
