import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  list(
    type?: string,
    from?: string,
    to?: string,
    user?: { sub: string; role: string },
  ) {
    const start = from ? new Date(from) : undefined;
    const end = to ? new Date(to) : undefined;
    const where: Prisma.ActivityWhereInput = {
      ...(type ? { type } : {}),
      ...(start || end
        ? {
            createdAt: {
              ...(start ? { gte: start } : {}),
              ...(end ? { lte: end } : {}),
            },
          }
        : {}),
      ...(user?.role === "BDE" ? { lead: { assignedBdeId: user.sub } } : {}),
    };
    return this.prisma.activity.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true } },
        lead: {
          select: {
            id: true,
            customerName: true,
            businessName: true,
            stage: true,
            assignedBde: { select: { fullName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
  }
}
