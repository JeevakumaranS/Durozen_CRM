import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Actor, assertActorRole } from "../../common/authorization/actor-role";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  list(
    type: string | undefined,
    from: string | undefined,
    to: string | undefined,
    search: string | undefined,
    category: string | undefined,
    page: number,
    pageSize: number,
    user: Actor,
  ) {
    assertActorRole(user, ["ADMIN", "BDE"]);
    const start = from ? new Date(from) : undefined;
    const end = to ? new Date(to) : undefined;
    const conditions: Prisma.ActivityWhereInput[] = [];
    if (category === "CALLS") {
      conditions.push({
        OR: [
          {
            type: {
              in: ["Call", "CALL", "Phone Call", "WhatsApp", "Email"],
            },
          },
          { contactType: { in: ["Phone Call", "WhatsApp", "Email"] } },
        ],
      });
    }
    if (search) {
      conditions.push({
        OR: [
          { description: { contains: search, mode: "insensitive" } },
          { outcome: { contains: search, mode: "insensitive" } },
          { user: { is: { fullName: { contains: search, mode: "insensitive" } } } },
          {
            lead: {
              is: {
                OR: [
                  { customerName: { contains: search, mode: "insensitive" } },
                  { businessName: { contains: search, mode: "insensitive" } },
                  { assignedBde: { fullName: { contains: search, mode: "insensitive" } } },
                ],
              },
            },
          },
        ],
      });
    }
    const where: Prisma.ActivityWhereInput = {
      ...(type ? { type } : {}),
      ...(conditions.length ? { AND: conditions } : {}),
      ...(start || end
        ? {
            createdAt: {
              ...(start ? { gte: start } : {}),
              ...(end ? { lte: end } : {}),
            },
          }
        : {}),
      ...(user.role === "BDE" ? { lead: { assignedBdeId: user.sub } } : {}),
    };
    return this.prisma.$transaction([
      this.prisma.activity.findMany({
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
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.activity.count({ where }),
    ]).then(([items, total]) => ({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }));
  }
}
