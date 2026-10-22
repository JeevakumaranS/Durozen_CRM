import * as assert from "node:assert/strict";
import { test } from "node:test";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthService } from "./auth.service";

test("logout records the logout time and clears online status", async () => {
  let update: { where: unknown; data: Record<string, unknown> } | undefined;
  const service = new AuthService({
    user: {
      updateMany: async (args: {
        where: unknown;
        data: Record<string, unknown>;
      }) => {
        update = args;
        return { count: 1 };
      },
    },
  } as unknown as PrismaService);

  const beforeLogout = Date.now();
  assert.deepEqual(await service.logout("user-1"), {
    message: "Signed out",
  });

  assert.deepEqual(update?.where, { id: "user-1", isActive: true });
  assert.equal(update?.data.isOnline, false);
  assert.ok(update?.data.lastActiveAt instanceof Date);
  assert.ok(
    Math.abs((update?.data.lastActiveAt as Date).getTime() - beforeLogout) <
      1_000,
  );
});

