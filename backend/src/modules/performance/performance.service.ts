import { BadRequestException, Injectable } from "@nestjs/common";
import { LeadStage, MeetingStatus } from "@prisma/client";
import { Actor, assertActorRole } from "../../common/authorization/actor-role";
import {
  businessDateParts,
  businessDateTime,
} from "../../common/utils/business-time";
import { PrismaService } from "../../prisma/prisma.service";

function dateBoundary(value: string, inclusiveEnd = false) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    const date = new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
    if (
      date.getUTCFullYear() !== Number(match[1]) ||
      date.getUTCMonth() + 1 !== Number(match[2]) ||
      date.getUTCDate() !== Number(match[3])
    ) {
      throw new BadRequestException("Invalid performance date range");
    }
    if (inclusiveEnd) date.setUTCDate(date.getUTCDate() + 1);
    return businessDateTime(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
    );
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException("Invalid performance date range");
  }
  return inclusiveEnd ? new Date(date.getTime() + 1) : date;
}

@Injectable()
export class PerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(
    from: string | undefined,
    to: string | undefined,
    user: Actor,
    assignedBdeId?: string,
  ) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    const now = new Date();
    const currentMonth = businessDateParts(now);
    const start = from
      ? dateBoundary(from)
      : businessDateTime(currentMonth.year, currentMonth.month, 1);
    const end = to ? dateBoundary(to, true) : now;
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      start > end
    ) {
      throw new BadRequestException("Invalid performance date range");
    }
    const range = { gte: start, lt: end };
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: "BDE",
        ...(user.role === "BDE"
          ? { id: user.sub }
          : user.role === "SALES_MANAGER"
            ? { managerId: user.sub }
            : {}),
        ...(assignedBdeId && user.role !== "BDE"
          ? { id: assignedBdeId }
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
      stageActivities,
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
        select: { assignedBdeId: true },
      }),
      this.prisma.activity.findMany({
        where: {
          createdAt: range,
          type: { in: ["CONTACT", "QUALIFICATION"] },
          lead: { assignedBdeId: { in: ids } },
        },
        select: { type: true, leadId: true, lead: { select: { assignedBdeId: true } } },
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
              dueAt: { gte: start, lt: end < now ? end : now },
            },
          ],
        },
        select: {
          status: true,
          dueAt: true,
          lead: { select: { assignedBdeId: true } },
        },
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
      const ownActivities = stageActivities.filter(
        (activity) => activity.lead.assignedBdeId === person.id,
      );
      const distinctLeadsAtActivity = (type: string) =>
        new Set(
          ownActivities
            .filter((activity) => activity.type === type)
            .map((activity) => activity.leadId),
        ).size;
      const ownFollowUps = followUps.filter(
        (item) => item.lead.assignedBdeId === person.id,
      );
      return {
        userId: person.id,
        name: person.fullName,
        totalLeads: owned.length,
        contacted: distinctLeadsAtActivity("CONTACT"),
        interested: distinctLeadsAtActivity("QUALIFICATION"),
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
          (item) => item.status === "PENDING" && item.dueAt < now,
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
