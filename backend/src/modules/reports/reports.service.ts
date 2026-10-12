import { BadRequestException, Injectable } from "@nestjs/common";
import { LeadStage, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { PerformanceService } from "../performance/performance.service";

type Actor = { sub: string; role: string };

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly performance: PerformanceService,
  ) {}

  async run(type: string, from?: string, to?: string, user?: Actor) {
    const range = this.range(from, to);
    const owner = user?.role === "BDE" ? user.sub : undefined;
    const leadWhere: Prisma.LeadWhereInput = {
      ...(range ? { createdAt: range } : {}),
      ...(owner ? { assignedBdeId: owner } : {}),
    };
    const stageDateWhere: Prisma.LeadWhereInput = {
      ...(range ? { stageEnteredAt: range } : {}),
      ...(owner ? { assignedBdeId: owner } : {}),
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
            ...(owner ? { lead: { assignedBdeId: owner } } : {}),
          },
          include: { lead: { include: leadInclude } },
          orderBy: { dueAt: "asc" },
        });
      case "proposals":
        return this.prisma.proposal.findMany({
          where: {
            ...(range ? { proposalDate: range } : {}),
            ...(owner ? { lead: { assignedBdeId: owner } } : {}),
          },
          include: { lead: { include: leadInclude } },
          orderBy: { proposalDate: "desc" },
        });
      case "meetings":
        return this.prisma.meeting.findMany({
          where: {
            ...(range ? { meetingAt: range } : {}),
            ...(owner ? { lead: { assignedBdeId: owner } } : {}),
          },
          include: { lead: { include: leadInclude } },
          orderBy: { meetingAt: "desc" },
        });
      case "negotiations":
        return this.prisma.negotiation.findMany({
          where: {
            ...(range ? { createdAt: range } : {}),
            ...(owner ? { lead: { assignedBdeId: owner } } : {}),
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

  async monthlySummary(month: string, user?: Actor) {
    if (!/^\d{4}-\d{2}$/.test(month))
      throw new BadRequestException("Month must use YYYY-MM format");
    const [year, monthIndex] = month.split("-").map(Number);
    const start = new Date(year, monthIndex - 1, 1);
    const end = new Date(year, monthIndex, 1);
    const owner = user?.role === "BDE" ? user.sub : undefined;
    const activityWhere: Prisma.ActivityWhereInput = {
      createdAt: { gte: start, lt: end },
      newStage: { not: null },
      ...(owner ? { lead: { assignedBdeId: owner } } : {}),
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
          ...(owner ? { assignedBdeId: owner } : {}),
        },
      }),
      this.prisma.activity.findMany({
        where: activityWhere,
        select: { leadId: true, newStage: true },
      }),
      this.prisma.meeting.count({
        where: {
          meetingAt: { gte: start, lt: end },
          ...(owner ? { lead: { assignedBdeId: owner } } : {}),
        },
      }),
      this.prisma.proposal.count({
        where: {
          proposalDate: { gte: start, lt: end },
          ...(owner ? { lead: { assignedBdeId: owner } } : {}),
        },
      }),
      this.prisma.negotiation.count({
        where: {
          createdAt: { gte: start, lt: end },
          ...(owner ? { lead: { assignedBdeId: owner } } : {}),
        },
      }),
      this.prisma.lead.count({
        where: {
          stage: LeadStage.WON,
          stageEnteredAt: { gte: start, lt: end },
          ...(owner ? { assignedBdeId: owner } : {}),
        },
      }),
      this.prisma.lead.count({
        where: {
          stage: LeadStage.LOST,
          stageEnteredAt: { gte: start, lt: end },
          ...(owner ? { assignedBdeId: owner } : {}),
        },
      }),
      this.prisma.lead.aggregate({
        where: {
          stage: LeadStage.WON,
          stageEnteredAt: { gte: start, lt: end },
          ...(owner ? { assignedBdeId: owner } : {}),
        },
        _sum: { finalDealValue: true },
      }),
    ]);
    const reached = new Map<LeadStage, Set<string>>();
    for (const activity of stageActivities) {
      if (!activity.newStage) continue;
      const set = reached.get(activity.newStage) ?? new Set<string>();
      set.add(activity.leadId);
      reached.set(activity.newStage, set);
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
