import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { LeadStage, MeetingStatus, Prisma } from "@prisma/client";
import { Actor, assertActorRole } from "../../common/authorization/actor-role";
import { leadScope } from "../../common/authorization/lead-scope";
import { PrismaService } from "../../prisma/prisma.service";
import { PerformanceService } from "../performance/performance.service";

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly performance: PerformanceService,
  ) {}

  async run(
    type: string,
    from: string | undefined,
    to: string | undefined,
    user: Actor,
  ) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    if (
      user.role === "BDE" &&
      !["bde-performance", "monthly-summary"].includes(type)
    ) {
      throw new ForbiddenException(
        "BDE users can only access their personal performance reports",
      );
    }
    const range = this.range(from, to);
    const scope = leadScope(user);
    const leadWhere: Prisma.LeadWhereInput = {
      ...(range ? { createdAt: range } : {}),
      ...scope,
    };
    const stageDateWhere: Prisma.LeadWhereInput = {
      ...(range ? { stageEnteredAt: range } : {}),
      ...scope,
    };
    const leadInclude = {
      assignedBde: { select: { fullName: true } },
    } as const;

    switch (type) {
      case "bde-performance":
        return (await this.performance.summary(from, to, user)).bdes;
      case "monthly-summary": {
        const month = from?.slice(0, 7) ?? new Date().toISOString().slice(0, 7);
        return [await this.monthlySummary(month, user)];
      }
      case "leads":
        return this.prisma.lead.findMany({
          where: leadWhere,
          include: leadInclude,
          orderBy: { createdAt: "desc" },
        });
      case "pipeline":
        return this.prisma.lead.findMany({
          where: {
            ...leadWhere,
            stage: { notIn: [LeadStage.WON, LeadStage.LOST] },
          },
          include: leadInclude,
          orderBy: [{ stage: "asc" }, { followUpAt: "asc" }],
        });
      case "follow-ups":
        return this.prisma.followUp.findMany({
          where: {
            ...(range ? { dueAt: range } : {}),
            lead: scope,
          },
          include: { lead: { include: leadInclude } },
          orderBy: { dueAt: "asc" },
        });
      case "proposals":
        return this.prisma.proposal.findMany({
          where: {
            ...(range ? { proposalDate: range } : {}),
            lead: scope,
          },
          include: { lead: { include: leadInclude } },
          orderBy: { proposalDate: "desc" },
        });
      case "meetings":
        return this.prisma.meeting.findMany({
          where: {
            ...(range ? { meetingAt: range } : {}),
            lead: scope,
          },
          include: { lead: { include: leadInclude } },
          orderBy: { meetingAt: "desc" },
        });
      case "negotiations":
        return this.prisma.negotiation.findMany({
          where: {
            ...(range ? { createdAt: range } : {}),
            lead: scope,
          },
          include: { lead: { include: leadInclude } },
          orderBy: { createdAt: "desc" },
        });
      case "won-lost":
        return this.prisma.lead.findMany({
          where: {
            ...stageDateWhere,
            stage: { in: [LeadStage.WON, LeadStage.LOST] },
          },
          include: leadInclude,
          orderBy: { stageEnteredAt: "desc" },
        });
      case "revenue":
        return this.prisma.lead.findMany({
          where: { ...stageDateWhere, stage: LeadStage.WON },
          include: leadInclude,
          orderBy: { stageEnteredAt: "desc" },
        });
      case "lost-leads":
        return this.prisma.lead.findMany({
          where: { ...stageDateWhere, stage: LeadStage.LOST },
          include: leadInclude,
          orderBy: { stageEnteredAt: "desc" },
        });
      default:
        throw new BadRequestException("Unknown report type");
    }
  }

  async monthlySummary(month: string, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    if (!/^\d{4}-\d{2}$/.test(month))
      throw new BadRequestException("Month must use YYYY-MM format");
    const [year, monthIndex] = month.split("-").map(Number);
    const start = new Date(year, monthIndex - 1, 1);
    const end = new Date(year, monthIndex, 1);
    const scope = leadScope(user);
    const activityWhere: Prisma.ActivityWhereInput = {
      createdAt: { gte: start, lt: end },
      lead: scope,
      type: { in: ["CONTACT", "QUALIFICATION"] },
    };
    const [
      leads,
      stageActivities,
      meetings,
      proposals,
      negotiations,
      won,
      lost,
      revenue,
    ] = await Promise.all([
      this.prisma.lead.count({
        where: {
          createdAt: { gte: start, lt: end },
          ...scope,
        },
      }),
      this.prisma.activity.findMany({
        where: activityWhere,
        select: { leadId: true, type: true },
      }),
      this.prisma.meeting.count({
        where: {
          meetingAt: { gte: start, lt: end },
          status: { not: MeetingStatus.CANCELLED },
          lead: scope,
        },
      }),
      this.prisma.proposal.count({
        where: {
          proposalDate: { gte: start, lt: end },
          lead: scope,
        },
      }),
      this.prisma.negotiation.count({
        where: {
          createdAt: { gte: start, lt: end },
          lead: scope,
        },
      }),
      this.prisma.lead.count({
        where: {
          stage: LeadStage.WON,
          stageEnteredAt: { gte: start, lt: end },
          ...scope,
        },
      }),
      this.prisma.lead.count({
        where: {
          stage: LeadStage.LOST,
          stageEnteredAt: { gte: start, lt: end },
          ...scope,
        },
      }),
      this.prisma.lead.aggregate({
        where: {
          stage: LeadStage.WON,
          stageEnteredAt: { gte: start, lt: end },
          ...scope,
        },
        _sum: { finalDealValue: true },
      }),
    ]);
    const reached = new Map<LeadStage, Set<string>>();
    for (const activity of stageActivities) {
      const stage =
        activity.type === "CONTACT"
          ? LeadStage.CONTACTED
          : LeadStage.INTERESTED;
      const set = reached.get(stage) ?? new Set<string>();
      set.add(activity.leadId);
      reached.set(stage, set);
    }
    const totalWon = won;
    return {
      month,
      totalLeads: leads,
      contacted: reached.get(LeadStage.CONTACTED)?.size ?? 0,
      interested: reached.get(LeadStage.INTERESTED)?.size ?? 0,
      meetings,
      proposals,
      negotiations,
      won: totalWon,
      lost,
      revenue: String(revenue._sum.finalDealValue ?? 0),
      conversionRate: leads ? Number(((totalWon / leads) * 100).toFixed(1)) : 0,
    };
  }

  private range(from?: string, to?: string) {
    if (!from && !to) return undefined;
    const start = from ? new Date(from) : new Date(0);
    const end = to ? new Date(to) : new Date();
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      start > end
    ) {
      throw new BadRequestException("Invalid report date range");
    }
    if (to) end.setDate(end.getDate() + 1);
    return { gte: start, lt: end };
  }
}
