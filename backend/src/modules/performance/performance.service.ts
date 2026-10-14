import { BadRequestException, Injectable } from "@nestjs/common";
import { LeadStage, MeetingStatus } from "@prisma/client";
import { Actor, assertActorRole } from "../../common/authorization/actor-role";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class PerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(from: string | undefined, to: string | undefined, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    const start = from
      ? new Date(from)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = to ? new Date(to) : new Date();
    end.setHours(23, 59, 59, 999);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      start > end
    ) {
      throw new BadRequestException("Invalid performance date range");
    }
    const range = { gte: start, lte: end };
    const now = new Date();
    const overdueEnd = end < now ? new Date(end.getTime() + 1) : now;
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: "BDE",
        ...(user.role === "BDE"
          ? { id: user.sub }
          : user.role === "SALES_MANAGER"
            ? { managerId: user.sub }
            : {}),
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    });
    const ids = users.map((item) => item.id);
    if (!ids.length)
      return { from: start.toISOString(), to: end.toISOString(), bdes: [] };

    const [
      leads,
      meetings,
      proposals,
      negotiations,
      followUps,
      revenue,
      wonLeads,
      lostLeads,
    ] = await Promise.all([
      this.prisma.lead.findMany({
        where: { assignedBdeId: { in: ids }, createdAt: range },
        select: { assignedBdeId: true, stage: true },
      }),
      this.prisma.meeting.findMany({
        where: {
          meetingAt: range,
          status: { not: MeetingStatus.CANCELLED },
          lead: { assignedBdeId: { in: ids } },
        },
        select: { lead: { select: { assignedBdeId: true } } },
      }),
      this.prisma.proposal.findMany({
        where: { proposalDate: range, lead: { assignedBdeId: { in: ids } } },
        select: { lead: { select: { assignedBdeId: true } } },
      }),
      this.prisma.negotiation.findMany({
        where: { createdAt: range, lead: { assignedBdeId: { in: ids } } },
        select: { lead: { select: { assignedBdeId: true } } },
      }),
      this.prisma.followUp.findMany({
        where: {
          lead: { assignedBdeId: { in: ids } },
          OR: [
            { status: "COMPLETED", updatedAt: range },
            {
              status: "PENDING",
              dueAt: { gte: start, lt: overdueEnd },
            },
          ],
        },
        select: { status: true, lead: { select: { assignedBdeId: true } } },
      }),
      this.prisma.lead.findMany({
        where: {
          assignedBdeId: { in: ids },
          stage: LeadStage.WON,
          stageEnteredAt: range,
        },
        select: { assignedBdeId: true, finalDealValue: true },
      }),
      this.prisma.lead.findMany({
        where: {
          assignedBdeId: { in: ids },
          stage: LeadStage.WON,
          stageEnteredAt: range,
        },
        select: { assignedBdeId: true },
      }),
      this.prisma.lead.findMany({
        where: {
          assignedBdeId: { in: ids },
          stage: LeadStage.LOST,
          stageEnteredAt: range,
        },
        select: { assignedBdeId: true },
      }),
    ]);
    const count = (
      rows: { lead: { assignedBdeId: string } }[],
      userId: string,
    ) => rows.filter((row) => row.lead.assignedBdeId === userId).length;
    const bdes = users.map((person) => {
      const owned = leads.filter((lead) => lead.assignedBdeId === person.id);
      const stageCount = (stage: LeadStage) =>
        owned.filter((lead) => lead.stage === stage).length;
      const ownFollowUps = followUps.filter(
        (item) => item.lead.assignedBdeId === person.id,
      );
      return {
        userId: person.id,
        name: person.fullName,
        totalLeads: owned.length,
        contacted: stageCount(LeadStage.CONTACTED),
        interested: stageCount(LeadStage.INTERESTED),
        meetings: count(meetings, person.id),
        proposals: count(proposals, person.id),
        negotiations: count(negotiations, person.id),
        won: wonLeads.filter((lead) => lead.assignedBdeId === person.id).length,
        lost: lostLeads.filter((lead) => lead.assignedBdeId === person.id)
          .length,
        followUpsCompleted: ownFollowUps.filter(
          (item) => item.status === "COMPLETED",
        ).length,
        overdueFollowUps: ownFollowUps.filter(
          (item) => item.status === "PENDING",
        ).length,
        revenue: String(
          revenue
            .filter((deal) => deal.assignedBdeId === person.id)
            .reduce((sum, deal) => sum + Number(deal.finalDealValue ?? 0), 0),
        ),
      };
    });
    return { from: start.toISOString(), to: end.toISOString(), bdes };
  }
}
