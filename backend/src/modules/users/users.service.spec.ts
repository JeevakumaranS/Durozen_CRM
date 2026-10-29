import * as assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaService } from "../../prisma/prisma.service";
import { UsersService } from "./users.service";

test("lists only BDEs assigned to the requesting manager", async () => {
  let query: unknown;
  const service = new UsersService({
    user: {
      findMany: async (args: unknown) => {
        query = args;
        return [];
      },
    },
  } as unknown as PrismaService);

  await service.listManagedBdes("manager-1");

  assert.deepEqual(query, {
    where: { role: "BDE", managerId: "manager-1" },
    select: {
      id: true,
      fullName: true,
      email: true,
      isActive: true,
      isOnline: true,
      lastActiveAt: true,
      _count: { select: { leads: true } },
    },
    orderBy: { fullName: "asc" },
  });
});
