import { Injectable } from "@nestjs/common";
import { LeadStage } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(user?: { sub: string; role: string }) {
    const assignedBdeId = user?.role === "BDE" ? user.sub : undefined;
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrow = new Date(todayStart);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
    const monthStart = new Date(
      todayStart.getFullYear(),
      todayStart.getMonth(),
      1,
    );

    const [
      grouped,
      todaysFollowUps,
      overdueFollowUps,
      todaysMeetings,
      todayRevenue,
      weekRevenue,
      monthRevenue,
      pipelineValue,
    ] = await Promise.all([
      this.prisma.lead.groupBy({
        by: ["stage"],
        where: assignedBdeId ? { assignedBdeId } : undefined,
        _count: { _all: true },
        _sum: { estimatedBudget: true },
      }),
      this.prisma.lead.count({
        where: {
          stage: { notIn: [LeadStage.WON, LeadStage.LOST] },
          followUpAt: { gte: todayStart, lt: tomorrow },
          ...(assignedBdeId ? { assignedBdeId } : {}),
        },
      }),
      this.prisma.lead.count({
        where: {
          stage: { notIn: [LeadStage.WON, LeadStage.LOST] },
          followUpAt: { lt: todayStart },
          ...(assignedBdeId ? { assignedBdeId } : {}),
        },
      }),
      this.prisma.meeting.count({
        where: {
          meetingAt: { gte: todayStart, lt: tomorrow },
          ...(assignedBdeId ? { lead: { assignedBdeId } } : {}),
        },
      }),
      this.wonRevenue(todayStart, tomorrow, assignedBdeId),
      this.wonRevenue(weekStart, tomorrow, assignedBdeId),
      this.wonRevenue(monthStart, tomorrow, assignedBdeId),
      this.prisma.lead.aggregate({
        where: {
          stage: { notIn: [LeadStage.WON, LeadStage.LOST] },
          ...(assignedBdeId ? { assignedBdeId } : {}),
        },
        _sum: { estimatedBudget: true },
      }),
    ]);

    const byStage = new Map(grouped.map((row) => [row.stage, row]));
    const count = (stage: LeadStage) => byStage.get(stage)?._count._all ?? 0;
    return {
      metrics: {
        newLeads: count(LeadStage.NEW_LEAD),
        contacted: count(LeadStage.CONTACTED),
        interested: count(LeadStage.INTERESTED),
        todaysMeetings,
        proposals: count(LeadStage.PROPOSAL),
        negotiations: count(LeadStage.NEGOTIATION),
        wonDeals: count(LeadStage.WON),
        lostDeals: count(LeadStage.LOST),
        todaysFollowUps,
        overdueFollowUps,
      },
      revenue: {
        today: String(todayRevenue),
        week: String(weekRevenue),
        month: String(monthRevenue),
        pipeline: String(pipelineValue._sum.estimatedBudget ?? 0),
      },
      pipeline: grouped.map((row) => ({
        stage: row.stage,
        count: row._count._all,
        value: String(row._sum.estimatedBudget ?? 0),
      })),
    };
  }

  private async wonRevenue(start: Date, end: Date, assignedBdeId?: string) {
    const result = await this.prisma.lead.aggregate({
      where: {
        stage: LeadStage.WON,
        stageEnteredAt: { gte: start, lt: end },
        ...(assignedBdeId ? { assignedBdeId } : {}),
      },
      _sum: { finalDealValue: true },
    });
    return result._sum.finalDealValue ?? 0;
  }
}
