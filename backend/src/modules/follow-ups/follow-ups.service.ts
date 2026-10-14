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
            lead,
          },
        }),
        this.prisma.followUp.count({
          where: {
            status: FollowUpStatus.PENDING,
            dueAt: { gte: tomorrow },
            lead,
          },
        }),
        this.prisma.followUp.count({
          where: {
            status: FollowUpStatus.PENDING,
            dueAt: { lt: start },
            lead,
          },
        }),
        this.prisma.followUp.count({
          where: { status: FollowUpStatus.COMPLETED, lead },
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

    const activeLead =
      existing.lead.stage !== LeadStage.WON &&
      existing.lead.stage !== LeadStage.LOST;
    const closesPending =
      existing.status === FollowUpStatus.PENDING &&
      (dto.status === FollowUpStatus.COMPLETED ||
        dto.status === FollowUpStatus.RESCHEDULED ||
        dto.status === FollowUpStatus.CANCELLED);
    if (
      activeLead &&
      closesPending &&
      (!dto.dueAt || !dto.nextAction?.trim())
    ) {
      throw new BadRequestException(
        "Set the next action and follow-up date before closing this follow-up.",
      );
    }
    if (
      closesPending &&
      dto.dueAt &&
      new Date(dto.dueAt).getTime() <= Date.now()
    ) {
      throw new BadRequestException(
        "The next follow-up date and time must be in the future.",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const transition = await tx.followUp.updateMany({
        where: { id, status: FollowUpStatus.PENDING },
        data: {
          status: dto.status,
          remarks: dto.remarks ?? existing.remarks,
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
      if (activeLead && closesPending && dto.dueAt && dto.nextAction) {
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
          data: { followUpAt: new Date(dto.dueAt), nextAction: dto.nextAction },
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
      return tx.followUp.findUniqueOrThrow({ where: { id } });
    });
  }
}
