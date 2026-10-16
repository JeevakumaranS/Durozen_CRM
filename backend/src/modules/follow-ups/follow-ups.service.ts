import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { FollowUpStatus, LeadStage, Prisma } from "@prisma/client";
import { Actor, assertActorRole } from "../../common/authorization/actor-role";
import { leadScope } from "../../common/authorization/lead-scope";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateFollowUpDto } from "./dto/create-follow-up.dto";
import { UpdateFollowUpDto } from "./dto/update-follow-up.dto";
import { canTransition } from "../pipeline/stage-rules";

type FollowUpFilters = {
  scope?: string;
  search?: string;
  type?: string;
  assignedBdeId?: string;
  status?: string;
  from?: string;
  to?: string;
};

const BUSINESS_TIME_ZONE = "Asia/Kolkata";

function zonedParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as { year: number; month: number; day: number };
}

function zonedDateTime(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const localParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(utcGuess));
  const values = Object.fromEntries(
    localParts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const representedUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
  );
  return new Date(utcGuess - (representedUtc - utcGuess));
}

function startOfBusinessDay(date: Date) {
  const { year, month, day } = zonedParts(date);
  return zonedDateTime(year, month, day);
}

function dateInputBoundary(value: string | undefined, inclusiveEnd = false) {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return parseDate(value, inclusiveEnd ? "To" : "From");
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() + 1 !== Number(match[2]) ||
    date.getUTCDate() !== Number(match[3])
  ) {
    throw new BadRequestException("Invalid date range.");
  }
  if (inclusiveEnd) date.setUTCDate(date.getUTCDate() + 1);
  return zonedDateTime(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

function parseDate(value: string | undefined, label: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`Invalid ${label} date.`);
  }
  return date;
}

@Injectable()
export class FollowUpsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: FollowUpFilters, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    const now = new Date();
    const start = startOfBusinessDay(now);
    const todayParts = zonedParts(start);
    const tomorrowDate = new Date(
      Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day + 1),
    );
    const tomorrow = zonedDateTime(
      tomorrowDate.getUTCFullYear(),
      tomorrowDate.getUTCMonth() + 1,
      tomorrowDate.getUTCDate(),
    );
    const allowedScopes = ["today", "overdue", "upcoming", "completed"];
    if (filters.scope && !allowedScopes.includes(filters.scope)) {
      throw new BadRequestException("Invalid follow-up scope.");
    }
    if (
      filters.status &&
      !Object.values(FollowUpStatus).includes(filters.status as FollowUpStatus)
    ) {
      throw new BadRequestException("Invalid follow-up status.");
    }
    const from = dateInputBoundary(filters.from);
    const to = dateInputBoundary(filters.to, true);
    const dateFilter: Prisma.DateTimeFilter = {};
    if (from) {
      dateFilter.gte = from;
    }
    if (to) {
      dateFilter.lt = to;
    }
    if (from && to && from >= to) {
      throw new BadRequestException("The To date must be on or after From.");
    }

    const conditions: Prisma.FollowUpWhereInput[] = [
      { lead: leadScope(user) },
      { type: { in: ["Proposal Follow-up", "Negotiation"] } },
    ];
    if (filters.scope === "today") {
      conditions.push({
        status: FollowUpStatus.PENDING,
        dueAt: { gte: start, lt: tomorrow },
      });
    } else if (filters.scope === "overdue") {
      conditions.push({
        status: FollowUpStatus.PENDING,
        dueAt: { lt: start },
      });
    } else if (filters.scope === "upcoming") {
      conditions.push({
        status: FollowUpStatus.PENDING,
        dueAt: { gte: tomorrow },
      });
    } else if (filters.scope === "completed") {
      conditions.push({ status: FollowUpStatus.COMPLETED });
    }
    if (filters.status) {
      conditions.push({ status: filters.status as FollowUpStatus });
    }
    if (filters.type?.trim()) {
      conditions.push({ type: filters.type.trim() });
    }
    if (filters.assignedBdeId) {
      conditions.push({
        lead: { assignedBdeId: filters.assignedBdeId },
      });
    }
    if (Object.keys(dateFilter).length) {
      conditions.push({ dueAt: dateFilter });
    }
    const search = filters.search?.trim();
    if (search) {
      conditions.push({
        OR: [
          { nextAction: { contains: search, mode: "insensitive" } },
          { remarks: { contains: search, mode: "insensitive" } },
          {
            lead: {
              OR: [
                { customerName: { contains: search, mode: "insensitive" } },
                { businessName: { contains: search, mode: "insensitive" } },
                { mobileNumber: { contains: search } },
                {
                  assignedBde: {
                    fullName: { contains: search, mode: "insensitive" },
                  },
                },
              ],
            },
          },
        ],
      });
    }

    return this.prisma.followUp.findMany({
      where: { AND: conditions },
      include: {
        lead: {
          select: {
            id: true,
            customerName: true,
            businessName: true,
            mobileNumber: true,
            stage: true,
            assignedBde: { select: { id: true, fullName: true } },
            activities: {
              where: { contactType: { not: null } },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { contactType: true },
            },
          },
        },
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
    });
  }

  summary(user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    const now = new Date();
    const start = startOfBusinessDay(now);
    const todayParts = zonedParts(start);
    const tomorrowDate = new Date(
      Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day + 1),
    );
    const tomorrow = zonedDateTime(
      tomorrowDate.getUTCFullYear(),
      tomorrowDate.getUTCMonth() + 1,
      tomorrowDate.getUTCDate(),
    );
    const lead = leadScope(user);
    return this.prisma
      .$transaction([
        this.prisma.followUp.count({
          where: {
            status: FollowUpStatus.PENDING,
            dueAt: { gte: start, lt: tomorrow },
            type: { in: ["Proposal Follow-up", "Negotiation"] },
            lead,
          },
        }),
        this.prisma.followUp.count({
          where: {
            status: FollowUpStatus.PENDING,
            dueAt: { gte: tomorrow },
            type: { in: ["Proposal Follow-up", "Negotiation"] },
            lead,
          },
        }),
        this.prisma.followUp.count({
          where: {
            status: FollowUpStatus.PENDING,
            dueAt: { lt: start },
            type: { in: ["Proposal Follow-up", "Negotiation"] },
            lead,
          },
        }),
        this.prisma.followUp.count({
          where: {
            status: FollowUpStatus.COMPLETED,
            type: { in: ["Proposal Follow-up", "Negotiation"] },
            lead,
          },
        }),
      ])
      .then(([dueToday, upcoming, overdue, completed]) => ({
        dueToday,
        upcoming,
        overdue,
        completed,
      }));
  }

  async create(dto: CreateFollowUpDto, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    if (!["Proposal Follow-up", "Negotiation"].includes(dto.type)) {
      throw new BadRequestException(
        "Tasks can only be created for proposals or negotiations.",
      );
    }
    const lead = await this.prisma.lead.findFirst({
      where: {
        id: dto.leadId,
        ...leadScope(user),
      },
    });
    if (!lead) throw new NotFoundException("Lead not found");
    if (lead.stage === LeadStage.WON || lead.stage === LeadStage.LOST) {
      throw new BadRequestException(
        "Follow-ups cannot be added to a closed lead",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const followUp = await tx.followUp.create({
        data: {
          leadId: lead.id,
          dueAt: new Date(dto.dueAt),
          type: dto.type,
          nextAction: dto.nextAction,
          remarks: dto.remarks,
        },
      });
      await tx.lead.update({
        where: { id: lead.id },
        data: { followUpAt: new Date(dto.dueAt), nextAction: dto.nextAction },
      });
      return followUp;
    });
  }

  async update(id: string, dto: UpdateFollowUpDto, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    if (dto.scheduleMeeting) {
      assertActorRole(user, ["ADMIN", "BDE"]);
    }
    const existing = await this.prisma.followUp.findFirst({
      where: {
        id,
        lead: leadScope(user),
      },
      include: { lead: true },
    });
    if (!existing) throw new NotFoundException("Follow-up not found");
    if (existing.status !== FollowUpStatus.PENDING) {
      if (existing.status === dto.status) {
        return existing;
      }
      throw new BadRequestException("Only pending follow-ups can be updated");
    }
    const isExistingLeadClosed =
      existing.lead.stage === LeadStage.WON ||
      existing.lead.stage === LeadStage.LOST;
    if (
      dto.status === FollowUpStatus.COMPLETED &&
      (!dto.contactDate ||
        !dto.contactType ||
        (dto.nextStage !== LeadStage.LOST &&
          (!dto.customerResponse?.trim() || !dto.requirement?.trim())) ||
        (!isExistingLeadClosed && !dto.nextStage))
    ) {
      throw new BadRequestException(
        "Contact date, contact type, next action, customer response, and requirements are required to complete a follow-up.",
      );
    }

    if (
      dto.scheduleMeeting &&
      (dto.status !== FollowUpStatus.COMPLETED ||
        dto.nextStage !== LeadStage.INTERESTED ||
        !dto.meetingAt ||
        !dto.meetingType)
    ) {
      throw new BadRequestException(
        "Meeting date and type are required when scheduling a meeting for an interested lead.",
      );
    }
    if (
      dto.scheduleMeeting &&
      dto.meetingAt &&
      new Date(dto.meetingAt).getTime() <= Date.now()
    ) {
      throw new BadRequestException(
        "The meeting date and time must be in the future.",
      );
    }
    const requestedNextStage = dto.nextStage ?? existing.lead.stage;
    const nextStage = requestedNextStage;
    if (
      dto.status === FollowUpStatus.COMPLETED &&
      !canTransition(existing.lead.stage, nextStage)
    ) {
      throw new BadRequestException(
        `Lead cannot move from ${existing.lead.stage} to ${nextStage}.`,
      );
    }
    if (
      dto.status === FollowUpStatus.RESCHEDULED &&
      !dto.rescheduleReason
    ) {
      throw new BadRequestException(
        "Choose a reason for rescheduling this follow-up.",
      );
    }
    const activeLead =
      nextStage !== LeadStage.WON && nextStage !== LeadStage.LOST;
    const closesPending =
      existing.status === FollowUpStatus.PENDING &&
      (dto.status === FollowUpStatus.COMPLETED ||
        dto.status === FollowUpStatus.RESCHEDULED ||
        dto.status === FollowUpStatus.CANCELLED);
    if (
      activeLead &&
      closesPending &&
      dto.status !== FollowUpStatus.COMPLETED &&
      (!dto.dueAt || !dto.nextAction?.trim())
    ) {
      throw new BadRequestException(
        "Set the next action and follow-up date before closing this follow-up.",
      );
    }
    if (closesPending && dto.dueAt) {
      const dueParts = zonedParts(new Date(dto.dueAt));
      const todayParts = zonedParts(new Date());
      const dueDate = `${dueParts.year}-${String(dueParts.month).padStart(2, "0")}-${String(dueParts.day).padStart(2, "0")}`;
      const today = `${todayParts.year}-${String(todayParts.month).padStart(2, "0")}-${String(todayParts.day).padStart(2, "0")}`;
      if (dueDate < today) {
        throw new BadRequestException(
          "The next follow-up date cannot be in the past.",
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const transition = await tx.followUp.updateMany({
        where: { id, status: FollowUpStatus.PENDING },
        data: {
          status: dto.status,
          remarks:
            dto.status === FollowUpStatus.COMPLETED
              ? (dto.remarks ?? null)
              : dto.status === FollowUpStatus.RESCHEDULED
                ? [
                    `Reschedule reason: ${dto.rescheduleReason}`,
                    dto.remarks?.trim()
                      ? `Remarks: ${dto.remarks.trim()}`
                      : "",
                  ]
                    .filter(Boolean)
                    .join("\n")
                : (dto.remarks ?? existing.remarks),
          ...(dto.status === FollowUpStatus.PENDING
            ? {
                dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
                nextAction: dto.nextAction,
              }
            : {}),
        },
      });
      if (transition.count !== 1) {
        throw new BadRequestException(
          "This follow-up has already been updated.",
        );
      }
      if (dto.status === FollowUpStatus.COMPLETED) {
        await tx.activity.create({
          data: {
            leadId: existing.leadId,
            userId: user.sub,
            type:
              requestedNextStage === LeadStage.INTERESTED
                ? "QUALIFICATION"
                : "CONTACT",
            description: `Follow-up completed: ${existing.nextAction}`,
            outcome: dto.customerResponse?.trim() || undefined,
            contactDate: new Date(dto.contactDate!),
            contactType: dto.contactType,
            customerResponse: dto.customerResponse?.trim() || undefined,
            expectedTimeline: dto.expectedTimeline,
          },
        });
      }
      if (
        dto.scheduleMeeting &&
        dto.meetingAt
      ) {
        const meetingAt = new Date(dto.meetingAt);
        const meetingNextAction = "Attend scheduled meeting";
        const meeting = await tx.meeting.create({
          data: {
            leadId: existing.leadId,
            meetingAt,
            type: dto.meetingType!,
            participants: dto.meetingParticipants?.trim() || undefined,
            requirement: dto.requirement ?? undefined,
            budget: dto.customerBudget ?? undefined,
            nextAction: meetingNextAction,
            followUpAt: meetingAt,
          },
        });
        await tx.activity.create({
          data: {
            leadId: existing.leadId,
            meetingId: meeting.id,
            userId: user.sub,
            type: "MEETING_SCHEDULED",
            description: `${meeting.type} scheduled for ${meeting.meetingAt.toISOString()}`,
          },
        });
        await tx.followUp.create({
          data: {
            leadId: existing.leadId,
            meetingId: meeting.id,
            dueAt: meetingAt,
            type: "Meeting",
            nextAction: meetingNextAction,
          },
        });
        await tx.lead.update({
          where: { id: existing.leadId },
          data: {
            followUpAt: meetingAt,
            nextAction: meetingNextAction,
          },
        });
      } else if (activeLead && closesPending && dto.dueAt && dto.nextAction) {
        await tx.followUp.create({
          data: {
            leadId: existing.leadId,
            meetingId: existing.meetingId,
            dueAt: new Date(dto.dueAt),
            type: existing.type,
            nextAction: dto.nextAction,
          },
        });
        await tx.lead.update({
          where: { id: existing.leadId },
          data: {
            followUpAt: new Date(dto.dueAt),
            nextAction: dto.nextAction,
          },
        });
      } else if (
        activeLead &&
        dto.status === FollowUpStatus.PENDING &&
        existing.dueAt.getTime() === existing.lead.followUpAt?.getTime() &&
        existing.nextAction === existing.lead.nextAction
      ) {
        await tx.lead.update({
          where: { id: existing.leadId },
          data: {
            followUpAt: dto.dueAt ? new Date(dto.dueAt) : existing.dueAt,
            nextAction: dto.nextAction ?? existing.nextAction,
          },
        });
      }
      if (dto.status === FollowUpStatus.COMPLETED) {
        const leadUpdate = await tx.lead.update({
          where: { id: existing.leadId },
          data: {
            stage: nextStage,
            stageEnteredAt:
              nextStage !== existing.lead.stage ? new Date() : undefined,
            requirement: dto.requirement,
            estimatedBudget: dto.customerBudget,
            remarks: dto.remarks,
            lostReason:
              nextStage === LeadStage.LOST
                ? (dto.lostReason ?? "Not Interested")
                : undefined,
            nextAction: dto.scheduleMeeting ? undefined : null,
            followUpAt: dto.scheduleMeeting ? undefined : null,
          },
          select: { id: true, stage: true },
        });
        if (leadUpdate.stage !== nextStage) {
          throw new BadRequestException(
            `Lead stage was not updated to ${nextStage}.`,
          );
        }
        if (nextStage === LeadStage.LOST) {
          await tx.followUp.updateMany({
            where: {
              leadId: existing.leadId,
              status: FollowUpStatus.PENDING,
            },
            data: { status: FollowUpStatus.CANCELLED },
          });
          await tx.callMessage.updateMany({
            where: {
              leadId: existing.leadId,
              status: FollowUpStatus.PENDING,
            },
            data: { status: FollowUpStatus.CANCELLED },
          });
        }
      }
      return tx.followUp.findUniqueOrThrow({ where: { id } });
    });
  }
}
