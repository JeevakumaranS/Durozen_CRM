import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import {
  FollowUpStatus,
  LeadStage,
  MeetingStatus,
  Prisma,
} from "@prisma/client";
import { Actor, assertActorRole } from "../../common/authorization/actor-role";
import { leadScope } from "../../common/authorization/lead-scope";
import {
  businessDateParts,
  businessDateTime,
  startOfBusinessDay,
} from "../../common/utils/business-time";
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
    filters: {
      assignedBdeId?: string;
      stage?: string;
      status?: string;
      category?: string;
      lostReason?: string;
    } = {},
  ) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    if (
      user.role === "BDE" &&
      !["bde-performance", "monthly-summary", "follow-ups"].includes(type)
    ) {
      throw new ForbiddenException(
        "BDE users can only access their personal performance and follow-up reports",
      );
    }
    if (
      filters.assignedBdeId &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        filters.assignedBdeId,
      )
    ) {
      throw new BadRequestException("Invalid assigned BDE identifier");
    }
    const range = this.range(from, to);
    const scope = leadScope(user);
    const stage = this.enumValue(
      filters.stage,
      Object.values(LeadStage),
      "Invalid report stage",
    ) as LeadStage | undefined;
    const status = this.enumValue(
      filters.status,
      Object.values(FollowUpStatus),
      "Invalid follow-up status",
    ) as FollowUpStatus | undefined;
    const category = this.enumValue(
      filters.category,
      ["today", "upcoming", "overdue", "completed"],
      "Invalid follow-up category",
    );
    const leadWhere: Prisma.LeadWhereInput = {
      ...(range ? { createdAt: range } : {}),
      ...(filters.assignedBdeId
        ? { assignedBdeId: filters.assignedBdeId }
        : {}),
      ...(stage ? { stage } : {}),
      ...(filters.lostReason
        ? { lostReason: { contains: filters.lostReason, mode: "insensitive" } }
        : {}),
      ...scope,
    };
    const stageDateWhere: Prisma.LeadWhereInput = {
      ...(range ? { stageEnteredAt: range } : {}),
      ...(filters.assignedBdeId
        ? { assignedBdeId: filters.assignedBdeId }
        : {}),
      ...(filters.lostReason
        ? { lostReason: { contains: filters.lostReason, mode: "insensitive" } }
        : {}),
      ...scope,
    };
    const relatedLeadWhere: Prisma.LeadWhereInput = {
      ...(filters.assignedBdeId
        ? { assignedBdeId: filters.assignedBdeId }
        : {}),
      ...scope,
    };
    switch (type) {
      case "bde-performance":
        return (
          await this.performance.summary(
            from,
            to,
            user,
            filters.assignedBdeId,
          )
        ).bdes;
      case "monthly-summary": {
        const currentMonth = businessDateParts(new Date());
        const month =
          from?.slice(0, 7) ??
          `${currentMonth.year}-${String(currentMonth.month).padStart(2, "0")}`;
        return [await this.monthlySummary(month, user)];
      }
      case "leads":
        return this.prisma.lead.findMany({
          where: leadWhere,
          select: {
            id: true,
            leadNumber: true,
            customerName: true,
            businessName: true,
            businessCategory: true,
            mobileNumber: true,
            email: true,
            location: true,
            requirement: true,
            estimatedBudget: true,
            leadSource: true,
            priority: true,
            assignedBde: { select: { fullName: true } },
            stage: true,
            nextAction: true,
            followUpAt: true,
            remarks: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        });
      case "lead-aging": {
        const leads = await this.prisma.lead.findMany({
          where: leadWhere,
          select: {
            id: true,
            customerName: true,
            businessName: true,
            assignedBde: { select: { fullName: true } },
            stage: true,
            stageEnteredAt: true,
            followUpAt: true,
            activities: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { createdAt: true },
            },
          },
          orderBy: { stageEnteredAt: "asc" },
        });
        const now = Date.now();
        return leads.map(({ activities, ...lead }) => ({
          ...lead,
          daysInCurrentStage: Math.floor(
            (now - lead.stageEnteredAt.getTime()) / 86_400_000,
          ),
          lastActivityAt: activities[0]?.createdAt ?? null,
          nextFollowUpAt: lead.followUpAt,
        }));
      }
      case "pipeline":
        return this.prisma.lead.findMany({
          where: {
            ...leadWhere,
            AND: [
              { stage: { notIn: [LeadStage.WON, LeadStage.LOST] } },
              ...(stage ? [{ stage }] : []),
            ],
          },
          select: {
            id: true,
            customerName: true,
            businessName: true,
            assignedBde: { select: { fullName: true } },
            stage: true,
            leadSource: true,
            estimatedBudget: true,
            followUpAt: true,
            stageEnteredAt: true,
            activities: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { createdAt: true },
            },
          },
          orderBy: [{ stage: "asc" }, { followUpAt: "asc" }],
        }).then((leads) => {
          const now = Date.now();
          return leads.map(({ activities, ...lead }) => ({
            ...lead,
            lastActivityAt: activities[0]?.createdAt ?? null,
            daysInCurrentStage: Math.floor(
              (now - lead.stageEnteredAt.getTime()) / 86_400_000,
            ),
          }));
        });
      case "follow-ups": {
        const today = startOfBusinessDay(new Date());
        const tomorrow = new Date(today.getTime() + 86_400_000);
        const dueConditions: Prisma.FollowUpWhereInput[] = [];
        if (range) dueConditions.push({ dueAt: range });
        if (category === "today")
          dueConditions.push({ dueAt: { gte: today, lt: tomorrow } });
        if (category === "upcoming")
          dueConditions.push({ dueAt: { gte: tomorrow } });
        if (category === "overdue")
          dueConditions.push({ dueAt: { lt: today } });
        const categoryStatus: FollowUpStatus | undefined =
          category === "completed" || category === "today" ||
          category === "upcoming" || category === "overdue"
            ? category === "completed"
              ? FollowUpStatus.COMPLETED
              : FollowUpStatus.PENDING
            : undefined;
        return this.prisma.followUp.findMany({
          where: {
            AND: [
              ...dueConditions,
              ...(status && status !== categoryStatus ? [{ status }] : []),
              ...(categoryStatus ? [{ status: categoryStatus }] : []),
            ],
            lead: {
              ...(stage ? { stage } : {}),
              ...relatedLeadWhere,
            },
          },
          select: {
            id: true,
            dueAt: true,
            type: true,
            status: true,
            nextAction: true,
            remarks: true,
            lead: {
              select: {
                customerName: true,
                businessName: true,
                assignedBde: { select: { fullName: true } },
                activities: {
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  select: { createdAt: true, description: true },
                },
              },
            },
          },
          orderBy: { dueAt: "asc" },
        });
      }
      case "proposals":
        return this.prisma.proposal.findMany({
          where: {
            ...(range ? { proposalDate: range } : {}),
            lead: relatedLeadWhere,
          },
          select: {
            id: true,
            proposalDate: true,
            finalAmount: true,
            customerResponse: true,
            lead: {
              select: {
                leadNumber: true,
                customerName: true,
                assignedBde: { select: { fullName: true } },
              },
            },
          },
          orderBy: { proposalDate: "desc" },
        });
      case "meetings":
        return this.prisma.meeting.findMany({
          where: {
            ...(range ? { meetingAt: range } : {}),
            lead: relatedLeadWhere,
          },
          select: {
            id: true,
            meetingAt: true,
            status: true,
            type: true,
            lead: {
              select: {
                customerName: true,
                businessName: true,
                assignedBde: { select: { fullName: true } },
              },
            },
          },
          orderBy: { meetingAt: "desc" },
        });
      case "negotiations":
        return this.prisma.negotiation.findMany({
          where: {
            ...(range ? { createdAt: range } : {}),
            lead: relatedLeadWhere,
          },
          select: {
            id: true,
            createdAt: true,
            negotiatedAmount: true,
            followUpAt: true,
            lead: {
              select: {
                customerName: true,
                businessName: true,
                assignedBde: { select: { fullName: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        });
      case "won-lost":
        return this.prisma.lead.findMany({
          where: {
            ...stageDateWhere,
            AND: [
              { stage: { in: [LeadStage.WON, LeadStage.LOST] } },
              ...(stage ? [{ stage }] : []),
            ],
          },
          select: {
            id: true,
            customerName: true,
            businessName: true,
            assignedBde: { select: { fullName: true } },
            stage: true,
            stageEnteredAt: true,
            finalDealValue: true,
            lostReason: true,
          },
          orderBy: { stageEnteredAt: "desc" },
        });
      case "revenue":
        return this.prisma.lead.findMany({
          where: {
            ...stageDateWhere,
            stage: LeadStage.WON,
          },
          select: {
            id: true,
            customerName: true,
            businessName: true,
            assignedBde: { select: { fullName: true } },
            stageEnteredAt: true,
            finalDealValue: true,
          },
          orderBy: { stageEnteredAt: "desc" },
        });
      case "lost-leads":
        return this.prisma.lead.findMany({
          where: {
            ...stageDateWhere,
            stage: LeadStage.LOST,
          },
          select: {
            id: true,
            customerName: true,
            businessName: true,
            assignedBde: { select: { fullName: true } },
            stageEnteredAt: true,
            lostReason: true,
            finalDealValue: true,
          },
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
    if (monthIndex < 1 || monthIndex > 12)
      throw new BadRequestException("Month must use YYYY-MM format");
    const start = businessDateTime(year, monthIndex, 1);
    const end = businessDateTime(year, monthIndex + 1, 1);
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

  bdeOptions(user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    return this.prisma.user.findMany({
      where: {
        role: "BDE",
        isActive: true,
        ...(user.role === "BDE"
          ? { id: user.sub }
          : user.role === "SALES_MANAGER"
            ? { managerId: user.sub }
            : {}),
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    });
  }

  private range(from?: string, to?: string) {
    if (!from && !to) return undefined;
    const start = from ? this.dateBoundary(from) : new Date(0);
    const end = to ? this.dateBoundary(to, true) : new Date();
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      start >= end
    ) {
      throw new BadRequestException("Invalid report date range");
    }
    return { gte: start, lt: end };
  }

  private dateBoundary(value: string, end = false) {
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
        throw new BadRequestException("Invalid report date range");
      }
      if (end) date.setUTCDate(date.getUTCDate() + 1);
      return businessDateTime(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        date.getUTCDate(),
      );
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException("Invalid report date range");
    }
    return end ? new Date(date.getTime() + 1) : date;
  }

  private enumValue(
    value: string | undefined,
    allowed: readonly string[],
    message: string,
  ) {
    if (!value) return undefined;
    if (!allowed.includes(value)) throw new BadRequestException(message);
    return value;
  }
}
