import * as assert from "node:assert/strict";
import { test } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { LeadStage, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CustomersService } from "./customers.service";

function createService(
  canViewCustomers: boolean,
  captureWhere: (where: Prisma.LeadWhereInput) => void,
) {
  const prisma = {
    user: {
      findUnique: async () => ({ canViewCustomers }),
    },
    lead: {
      findMany: async ({ where }: { where: Prisma.LeadWhereInput }) => {
        captureWhere(where);
        return [];
      },
    },
  } as unknown as PrismaService;
  return new CustomersService(prisma);
}

test("BDE sees only won customers assigned to them", async () => {
  let where: Prisma.LeadWhereInput | undefined;
  const service = createService(true, (query) => {
    where = query;
  });

  await service.list({ sub: "bde-1", role: "BDE" });

  assert.deepEqual(where, {
    stage: LeadStage.WON,
    assignedBdeId: "bde-1",
  });
});

test("Sales Manager sees won customers assigned to them and their BDE team", async () => {
  let where: Prisma.LeadWhereInput | undefined;
  const service = createService(true, (query) => {
    where = query;
  });

  await service.list({ sub: "manager-1", role: "SALES_MANAGER" });

  assert.deepEqual(where, {
    stage: LeadStage.WON,
    OR: [
      { assignedBdeId: "manager-1" },
      { assignedBde: { is: { managerId: "manager-1" } } },
    ],
  });
});

test("users without customer access are forbidden", async () => {
  const service = createService(false, () => {
    assert.fail("Should not query customers without access");
  });

  await assert.rejects(
    service.list({ sub: "bde-1", role: "BDE" }),
    ForbiddenException,
  );
});
