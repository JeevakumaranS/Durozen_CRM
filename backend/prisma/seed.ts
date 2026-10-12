import { PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcrypt";
const prisma = new PrismaClient();
async function main() {
  const passwordHash = await bcrypt.hash("ChangeMe123!", 10);
  await prisma.user.upsert({
    where: { email: "admin@durozen.com" },
    update: {},
    create: {
      fullName: "Durozen Administrator",
      email: "admin@durozen.com",
      passwordHash,
      role: UserRole.ADMIN,
    },
  });
}
main().finally(() => prisma.$disconnect());
