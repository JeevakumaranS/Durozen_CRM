import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { FollowUpStatus, LeadStage, MeetingStatus } from "@prisma/client";
import { Actor, assertActorRole } from "../../common/authorization/actor-role";
import { formatBusinessDateTime } from "../../common/business-time";
import {
  assertLeadHasNoOtherActiveWork,
  lockLeadActiveWork,
} from "../../common/active-lead-work";
import { leadScope } from "../../common/authorization/lead-scope";
import { PrismaService } from "../../prisma/prisma.service";
import { canTransition } from "../pipeline/stage-rules";
import { CompleteCallMessageDto } from "./dto/complete-call-message.dto";
import { CompleteLeadCallDto } from "./dto/complete-lead-call.dto";
import { CreateCallMessageDto } from "./dto/create-call-message.dto";

const CONTACT_METHODS = ["Phone Call", "WhatsApp", "Email"];
const BUSINESS_TIME_ZONE_OFFSET_MINUTES = 330;

function dateBoundary(value: string | undefined, inclusiveEnd = false) {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new BadRequestException("Invalid call date filter.");
  const [, year, month, day] = match.map(Number);
  const date = new Date(
    Date.UTC(
      year,
      month - 1,
      day + (inclusiveEnd ? 1 : 0),
      0,
      -BUSINESS_TIME_ZONE_OFFSET_MINUTES,
    ),
  );
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    throw new BadRequestException("Invalid call date filter.");
  }
  return date;
}

type CallMessageFilters = {
  status?: string;
  from?: string;
  to?: string;
};

const callMessageInclude = {
  lead: {
    select: {
      id: true,
      customerName: true,
      businessName: true,
      mobileNumber: true,
      stage: true,
      nextAction: true,
      followUpAt: true,
      priority: true,
      estimatedBudget: true,
      requirement: true,
      assignedBde: { select: { id: true, fullName: true } },
    },
  },
  user: { select: { id: true, fullName: true } },
} as const;

@Injectable()
export class CallsMessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: CallMessageFilters, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    const statuses = filters.status
      ?.split(",")
      .filter(Boolean) as FollowUpStatus[] | undefined;
    if (
      statuses?.some((status) => !Object.values(FollowUpStatus).includes(status))
    ) {
      throw new BadRequestException("Invalid call or message status.");
    }
    const from = dateBoundary(filters.from);
    const to = dateBoundary(filters.to, true);
    const dateFilter: { gte?: Date; lt?: Date } = {};
    if (from) dateFilter.gte = from;
    if (to) dateFilter.lt = to;
    if (from && to && from >= to) {
      throw new BadRequestException("The To date must be on or after From.");
    }
    const where = {
      lead: leadScope(user),
      ...(statuses?.length ? { status: { in: statuses } } : {}),
      ...(Object.keys(dateFilter).length ? { dueAt: dateFilter } : {}),
    };
    return this.prisma.callMessage.findMany({
      where,
      include: callMessageInclude,
      orderBy:
        statuses?.length === 1 && statuses[0] === "COMPLETED"
          ? [{ completedAt: "desc" }, { createdAt: "desc" }]
          : [{ dueAt: "asc" }, { createdAt: "asc" }],
    });
  }

  async create(dto: CreateCallMessageDto, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    if (!CONTACT_METHODS.includes(dto.contactMethod)) {
      throw new BadRequestException("Choose Phone Call, WhatsApp, or Email.");
    }
    if (
      dto.status === FollowUpStatus.COMPLETED &&
      !dto.description?.trim() &&
      !dto.outcome?.trim()
    ) {
      throw new BadRequestException(
        "Enter call notes or an outcome when logging a completed call.",
      );
    }
    const lead = await this.prisma.lead.findFirst({
      where: {
        id: dto.leadId,
        ...leadScope(user),
      },
      select: { id: true, stage: true },
    });
    if (!lead) throw new NotFoundException("Lead not found");
    const completed = dto.status === FollowUpStatus.COMPLETED;
    if (!completed && (lead.stage === "WON" || lead.stage === "LOST")) {
      throw new BadRequestException(
        "Cannot schedule a call for a closed lead.",
      );
    }
    return this.prisma.$transaction(async (tx) => {
      if (!completed) {
        await assertLeadHasNoOtherActiveWork(tx, lead.id);
      }
      const callMessage = await tx.callMessage.create({
        data: {
          leadId: lead.id,
          userId: user.sub,
          dueAt: new Date(dto.dueAt),
          contactMethod: dto.contactMethod,
          description: dto.description?.trim() || undefined,
          outcome: dto.outcome?.trim() || undefined,
          status: dto.status,
          completedAt: completed ? new Date() : undefined,
        },
        include: callMessageInclude,
      });
      if (!completed) {
        await tx.lead.update({
          where: { id: lead.id },
          data: {
            nextAction: dto.contactMethod,
            followUpAt: new Date(dto.dueAt),
          },
        });
      }
      return callMessage;
    });
  }

  async reschedule(id: string, dueAtValue: string, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    const dueAt = new Date(dueAtValue);
    if (dueAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        "The call date and time must be in the future.",
      );
    }
    const existing = await this.prisma.callMessage.findFirst({
      where: { id, lead: leadScope(user) },
      include: { lead: { select: { id: true } } },
    });
    if (!existing) throw new NotFoundException("Call task not found");
    if (existing.contactMethod.trim().toLowerCase() !== "phone call") {
      throw new BadRequestException("Only phone calls can be rescheduled.");
    }
    if (existing.status !== FollowUpStatus.PENDING) {
      throw new BadRequestException("Only pending phone calls can be rescheduled.");
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.callMessage.updateMany({
        where: { id, status: FollowUpStatus.PENDING },
        data: { dueAt },
      });
      if (updated.count !== 1) {
        throw new BadRequestException(
          "This phone call is no longer pending and cannot be rescheduled.",
        );
      }
      await tx.lead.updateMany({
        where: {
          id: existing.leadId,
          nextAction: existing.contactMethod,
          followUpAt: existing.dueAt,
        },
        data: { followUpAt: dueAt },
      });
      return tx.callMessage.findUniqueOrThrow({
        where: { id },
        include: callMessageInclude,
      });
    });
  }

  async complete(
    id: string,
    dto: CompleteCallMessageDto,
    user: Actor,
  ) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    const existing = await this.prisma.callMessage.findFirst({
      where: { id, lead: leadScope(user) },
      include: { lead: { select: { id: true, stage: true } } },
    });
    if (!existing) throw new NotFoundException("Call or message task not found");
    if (existing.status !== FollowUpStatus.PENDING) {
      throw new BadRequestException("Only pending call tasks can be completed.");
    }
    return this.finishCompletion(existing, dto, user);
  }

  async completeLead(dto: CompleteLeadCallDto, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    const lead = await this.prisma.lead.findFirst({
      where: { id: dto.leadId, ...leadScope(user) },
      select: { id: true, stage: true },
    });
    if (!lead) throw new NotFoundException("Lead not found");
    const pendingCall = await this.prisma.callMessage.findFirst({
      where: {
        leadId: lead.id,
        status: FollowUpStatus.PENDING,
        lead: leadScope(user),
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
      include: { lead: { select: { id: true, stage: true } } },
    });
    return this.finishCompletion(
      pendingCall ?? {
        id: null,
        leadId: lead.id,
        contactMethod: dto.contactMethod,
        description: null,
        lead,
      },
      dto,
      user,
    );
  }

  private async finishCompletion(
    existing: {
      id: string | null;
      leadId: string;
      contactMethod: string;
      description: string | null;
      lead: { id: string; stage: LeadStage };
    },
    dto: CompleteCallMessageDto,
    user: Actor,
  ) {
    const notInterested = dto.responseAction === "Not Interested";
    if (notInterested) {
      if (!dto.lostReason?.trim()) {
        throw new BadRequestException(
          "A lost reason is required to complete this call.",
        );
      }
    } else if (!dto.customerResponse?.trim() || !dto.requirement?.trim()) {
      throw new BadRequestException(
        "Customer response and requirements are required to complete this call.",
      );
    }
    const nextStage =
      dto.responseAction === "Not Interested"
        ? LeadStage.LOST
        : dto.responseAction === "Decision pending"
          ? LeadStage.CONTACTED
          : LeadStage.INTERESTED;
    if (
      dto.responseAction === "Interested" &&
      dto.scheduleMeeting === undefined
    ) {
      throw new BadRequestException(
        "Choose whether to schedule a meeting for an interested lead.",
      );
    }
    if (
      dto.scheduleMeeting &&
      (dto.responseAction !== "Interested" ||
        !dto.meetingAt ||
        !dto.meetingType)
    ) {
      throw new BadRequestException(
        "Meeting date, time, and type are required when scheduling a meeting.",
      );
    }
    const meetingAt = dto.meetingAt ? new Date(dto.meetingAt) : undefined;
    if (meetingAt && meetingAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        "The meeting date and time must be in the future.",
      );
    }
    if (!canTransition(existing.lead.stage, nextStage)) {
      throw new BadRequestException(
        `Lead cannot move from ${existing.lead.stage} to ${nextStage}.`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      if (dto.scheduleMeeting && meetingAt) {
        await assertLeadHasNoOtherActiveWork(tx, existing.leadId, {
          callMessageId: existing.id ?? undefined,
        });
      } else {
        await lockLeadActiveWork(tx, existing.leadId);
      }
      let callMessageId = existing.id;
      const callMessageData = {
          status: FollowUpStatus.COMPLETED,
          description: dto.remarks?.trim() || existing.description,
          outcome: notInterested
            ? dto.lostReason!.trim()
            : dto.customerResponse!.trim(),
          completedAt: new Date(),
      };
      if (callMessageId) {
        const updated = await tx.callMessage.updateMany({
          where: { id: callMessageId, status: FollowUpStatus.PENDING },
          data: callMessageData,
        });
        if (updated.count !== 1) {
          throw new BadRequestException(
            "This call task has already been completed.",
          );
        }
      } else {
        const callMessage = await tx.callMessage.create({
          data: {
            leadId: existing.leadId,
            userId: user.sub,
            contactMethod: existing.contactMethod,
            dueAt: new Date(dto.contactDate),
            ...callMessageData,
          },
        });
        callMessageId = callMessage.id;
      }

      await tx.activity.create({
        data: {
          leadId: existing.leadId,
          userId: user.sub,
          type: "CONTACT",
          description: `Call completed: ${dto.responseAction}`,
          outcome: notInterested
            ? dto.lostReason!.trim()
            : dto.customerResponse!.trim(),
          contactDate: new Date(dto.contactDate),
          contactType: existing.contactMethod,
          customerResponse: notInterested
            ? undefined
            : dto.customerResponse!.trim(),
        },
      });

      if (dto.scheduleMeeting && meetingAt && dto.meetingType) {
        const meetingNextAction = "Attend scheduled meeting";
        const meeting = await tx.meeting.create({
          data: {
            leadId: existing.leadId,
            meetingAt,
            status: MeetingStatus.SCHEDULED,
            type: dto.meetingType,
            requirement: dto.requirement!.trim(),
            discussionNotes: dto.remarks?.trim() || undefined,
            nextAction: meetingNextAction,
            followUpAt: meetingAt,
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
        await tx.activity.create({
          data: {
            leadId: existing.leadId,
            meetingId: meeting.id,
            userId: user.sub,
            type: "MEETING_SCHEDULED",
            description: `${meeting.type} scheduled for ${formatBusinessDateTime(meeting.meetingAt)}`,
          },
        });
      }

      await tx.lead.update({
        where: { id: existing.leadId },
        data: {
          stage: nextStage,
          stageEnteredAt:
            nextStage !== existing.lead.stage ? new Date() : undefined,
          requirement: notInterested ? undefined : dto.requirement!.trim(),
          remarks: dto.remarks?.trim() || undefined,
          lostReason:
            nextStage === LeadStage.LOST ? dto.lostReason!.trim() : undefined,
          nextAction: dto.scheduleMeeting ? "Attend scheduled meeting" : null,
          followUpAt: dto.scheduleMeeting ? meetingAt : null,
        },
      });

      if (nextStage === LeadStage.LOST) {
        await tx.followUp.updateMany({
          where: { leadId: existing.leadId, status: FollowUpStatus.PENDING },
          data: { status: FollowUpStatus.CANCELLED },
        });
        await tx.callMessage.updateMany({
          where: {
            leadId: existing.leadId,
            status: FollowUpStatus.PENDING,
            ...(callMessageId ? { id: { not: callMessageId } } : {}),
          },
          data: { status: FollowUpStatus.CANCELLED },
        });
      }

      return tx.callMessage.findUniqueOrThrow({
        where: { id: callMessageId! },
        include: callMessageInclude,
      });
    });
  }
}
