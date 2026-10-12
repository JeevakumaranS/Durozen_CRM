import { Injectable } from "@nestjs/common";
import { LeadStage } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: { sub: string; role: string }) {
    return this.prisma.lead.findMany({
      where: {
        stage: LeadStage.WON,
        ...(user.role === "BDE" ? { assignedBdeId: user.sub } : {}),
      },
      include: { assignedBde: { select: { id: true, fullName: true } } },
      orderBy: { stageEnteredAt: "desc" },
    });
  }
}
