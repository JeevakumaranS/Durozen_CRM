import { Injectable } from "@nestjs/common";
import { LeadStage } from "@prisma/client";
import { Actor, assertActorRole } from "../../common/authorization/actor-role";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: Actor) {
    assertActorRole(user, ["ADMIN"]);
    return this.prisma.lead.findMany({
      where: {
        stage: LeadStage.WON,
      },
      include: { assignedBde: { select: { id: true, fullName: true } } },
      orderBy: { stageEnteredAt: "desc" },
    });
  }
}
