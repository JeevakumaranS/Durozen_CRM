import { ForbiddenException, Injectable } from "@nestjs/common";
import { LeadStage, Prisma } from "@prisma/client";
import { Actor, assertActorRole } from "../../common/authorization/actor-role";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: Actor) {
    assertActorRole(user, ["ADMIN", "SALES_MANAGER", "BDE"]);
    let ownershipScope: Prisma.LeadWhereInput = {};
    if (user.role !== "ADMIN") {
      const account = await this.prisma.user.findUnique({
        where: { id: user.sub, isActive: true },
        select: { canViewCustomers: true },
      });
      if (!account?.canViewCustomers) throw new ForbiddenException();
      ownershipScope =
        user.role === "BDE"
          ? { assignedBdeId: user.sub }
          : {
              OR: [
                { assignedBdeId: user.sub },
                { assignedBde: { is: { managerId: user.sub } } },
              ],
            };
    }
    return this.prisma.lead.findMany({
      where: {
        stage: LeadStage.WON,
        ...ownershipScope,
      },
      include: { assignedBde: { select: { id: true, fullName: true } } },
      orderBy: { stageEnteredAt: "desc" },
    });
  }
}
