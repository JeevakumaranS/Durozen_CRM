import * as assert from "node:assert/strict";
import { test } from "node:test";
import { LeadStage, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { DashboardService } from "./dashboard.service";

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
