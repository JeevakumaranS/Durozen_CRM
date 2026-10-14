import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  FollowUpStatus,
  LeadStage,
  MeetingStatus,
  Prisma,
} from "@prisma/client";
import { Actor, assertActorRole } from "../../common/authorization/actor-role";
import { leadScope } from "../../common/authorization/lead-scope";
import { PrismaService } from "../../prisma/prisma.service";
import { StageTransitionService } from "../pipeline/stage-transition.service";
import { CreateMeetingDto } from "./dto/create-meeting.dto";
import { UpdateMeetingDto } from "./dto/update-meeting.dto";

const meetingInclude = {
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
  activities: {
    orderBy: { createdAt: "desc" as const },
    include: { user: { select: { fullName: true } } },
  },
  followUps: { orderBy: { dueAt: "asc" as const } },
} satisfies Prisma.MeetingInclude;

type MeetingFilters = {
  date?: string;
  from?: string;
  to?: string;
  status?: string;
  search?: string;
};

@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: StageTransitionService,
  ) {}

  list(filters: MeetingFilters, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE"]);
    const from = filters.from ?? filters.date;
    const to = filters.to ?? filters.date;
    if (from && to && from > to) {
      throw new BadRequestException("Meeting start date must be before end date");
    }
    const meetingAt: Prisma.DateTimeFilter = {};
    if (from) meetingAt.gte = this.parseDateBoundary(from, false);
    if (to) meetingAt.lt = this.parseDateBoundary(to, true);

    let status: MeetingStatus | undefined;
    if (filters.status && filters.status !== "ALL") {
      if (!Object.values(MeetingStatus).includes(filters.status as MeetingStatus)) {
        throw new BadRequestException("Unknown meeting status");
      }
      status = filters.status as MeetingStatus;
    }
    const search = filters.search?.trim();
    const where: Prisma.MeetingWhereInput = {
      ...(Object.keys(meetingAt).length ? { meetingAt } : {}),
      ...(status ? { status } : {}),
      lead: {
        ...leadScope(user),
        ...(search
          ? {
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
            }
          : {}),
      },
    };
    return this.prisma.meeting.findMany({
      where,
      include: meetingInclude,
      orderBy: [{ meetingAt: "asc" }, { createdAt: "desc" }],
    });
  }

  async get(id: string, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE"]);
    const meeting = await this.prisma.meeting.findFirst({
      where: { id, lead: leadScope(user) },
      include: meetingInclude,
    });
    if (!meeting) throw new NotFoundException("Meeting not found");
    return meeting;
  }

  async create(dto: CreateMeetingDto, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE"]);
    const lead = await this.prisma.lead.findFirst({
      where: { id: dto.leadId, ...leadScope(user) },
    });
    if (!lead) throw new NotFoundException("Lead not found");
    if (lead.stage === LeadStage.WON || lead.stage === LeadStage.LOST) {
      throw new BadRequestException(
        "Closed leads cannot be scheduled for meetings",
      );
    }

    const stageChanged =
      lead.stage !== LeadStage.MEETING &&
      this.transitions.canTransition(lead.stage, LeadStage.MEETING);
    const meetingAt = new Date(dto.meetingAt);
    const followUpAt = new Date(dto.followUpAt);
    this.requireLeadNextAction(lead.stage, dto.nextAction, followUpAt);

    return this.prisma.$transaction(async (tx) => {
      const meeting = await tx.meeting.create({
        data: {
          leadId: lead.id,
          meetingAt,
          status: MeetingStatus.SCHEDULED,
          type: dto.type,
          participants: dto.participants,
          requirement: dto.requirement,
          budget: dto.budget,
          discussionNotes: dto.discussionNotes,
          customerConcerns: dto.customerConcerns,
          nextAction: dto.nextAction,
          followUpAt,
        },
      });
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          ...(stageChanged
            ? { stage: LeadStage.MEETING, stageEnteredAt: new Date() }
            : {}),
          requirement: dto.requirement ?? undefined,
          estimatedBudget: dto.budget,
          nextAction: dto.nextAction,
          followUpAt,
        },
      });
      await tx.activity.create({
        data: {
          leadId: lead.id,
          meetingId: meeting.id,
          userId: user.sub,
          type: "MEETING_SCHEDULED",
          description: `${dto.type} scheduled for ${meetingAt.toISOString()}`,
          previousStage: stageChanged ? lead.stage : undefined,
          newStage: stageChanged ? LeadStage.MEETING : undefined,
        },
      });
      await tx.followUp.create({
        data: {
          leadId: lead.id,
          meetingId: meeting.id,
          dueAt: followUpAt,
          type: "Meeting",
          nextAction: dto.nextAction,
        },
      });
      return tx.meeting.findUniqueOrThrow({
        where: { id: meeting.id },
        include: meetingInclude,
      });
    });
  }

  async update(id: string, dto: UpdateMeetingDto, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE"]);
    const existing = await this.findAccessible(id, user);
    this.requireScheduled(existing.status);

    const nextAction = dto.nextAction ?? existing.nextAction;
    const followUpAt = dto.followUpAt
      ? new Date(dto.followUpAt)
      : existing.followUpAt;
    const followUpChanged =
      dto.nextAction !== undefined || dto.followUpAt !== undefined;
    if (followUpChanged) {
      if (
        existing.lead.stage === LeadStage.WON ||
        existing.lead.stage === LeadStage.LOST
      ) {
        throw new BadRequestException(
          "Closed leads cannot have meeting follow-ups changed",
        );
      }
      this.requireLeadNextAction(existing.lead.stage, nextAction, followUpAt);
    }

    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.meeting.updateMany({
        where: { id, status: MeetingStatus.SCHEDULED, lead: leadScope(user) },
        data: {
          type: dto.type,
          participants: dto.participants,
          requirement: dto.requirement,
          budget: dto.budget,
          discussionNotes: dto.discussionNotes,
          customerConcerns: dto.customerConcerns,
          nextAction: dto.nextAction,
          followUpAt: dto.followUpAt ? followUpAt : undefined,
        },
      });
      if (changed.count !== 1) {
        throw new BadRequestException(
          "Only scheduled meetings can be edited",
        );
      }

      if (dto.requirement !== undefined || dto.budget !== undefined) {
        await tx.lead.update({
          where: { id: existing.leadId },
          data: {
            requirement: dto.requirement,
            estimatedBudget: dto.budget,
          },
        });
      }
      if (followUpChanged) {
        const pending = await tx.followUp.findFirst({
          where: {
            meetingId: id,
            status: FollowUpStatus.PENDING,
          },
        });
        if (pending) {
          await tx.followUp.update({
            where: { id: pending.id },
            data: { dueAt: followUpAt, nextAction },
          });
        } else {
          await tx.followUp.create({
            data: {
              leadId: existing.leadId,
              meetingId: id,
              dueAt: followUpAt,
              type: "Meeting",
              nextAction,
            },
          });
        }
        await tx.lead.update({
          where: { id: existing.leadId },
          data: { nextAction, followUpAt },
        });
      }
      await tx.activity.create({
        data: {
          leadId: existing.leadId,
          meetingId: id,
          userId: user.sub,
          type: "MEETING_UPDATED",
          description: "Scheduled meeting details updated",
        },
      });
      return tx.meeting.findUniqueOrThrow({
        where: { id },
        include: meetingInclude,
      });
    });
  }

  async reschedule(id: string, meetingAtValue: string, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE"]);
    const existing = await this.findAccessible(id, user);
    this.requireScheduled(existing.status);
    const meetingAt = new Date(meetingAtValue);

    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.meeting.updateMany({
        where: { id, status: MeetingStatus.SCHEDULED, lead: leadScope(user) },
        data: { meetingAt },
      });
      if (changed.count !== 1) {
        throw new BadRequestException(
          "Only scheduled meetings can be rescheduled",
        );
      }
      await tx.activity.create({
        data: {
          leadId: existing.leadId,
          meetingId: id,
          userId: user.sub,
          type: "MEETING_RESCHEDULED",
          description: `Meeting rescheduled from ${existing.meetingAt.toISOString()} to ${meetingAt.toISOString()}`,
        },
      });
      return tx.meeting.findUniqueOrThrow({
        where: { id },
        include: meetingInclude,
      });
    });
  }

  async complete(id: string, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE"]);
    const existing = await this.findAccessible(id, user);
    if (existing.status === MeetingStatus.COMPLETED) return existing;
    this.requireScheduled(existing.status);

    return this.prisma.$transaction(async (tx) => {
      const completedAt = new Date();
      const changed = await tx.meeting.updateMany({
        where: { id, status: MeetingStatus.SCHEDULED, lead: leadScope(user) },
        data: { status: MeetingStatus.COMPLETED, completedAt },
      });
      if (changed.count === 0) {
        const current = await tx.meeting.findFirst({
          where: { id, lead: leadScope(user) },
          include: meetingInclude,
        });
        if (current?.status === MeetingStatus.COMPLETED) return current;
        if (!current) throw new NotFoundException("Meeting not found");
        throw new BadRequestException(
          "Only scheduled meetings can be completed",
        );
      }
      await tx.activity.create({
        data: {
          leadId: existing.leadId,
          meetingId: id,
          userId: user.sub,
          type: "MEETING_COMPLETED",
          description: `Meeting completed at ${completedAt.toISOString()}`,
        },
      });
      return tx.meeting.findUniqueOrThrow({
        where: { id },
        include: meetingInclude,
      });
    });
  }

  async cancel(id: string, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE"]);
    const existing = await this.findAccessible(id, user);
    if (existing.status === MeetingStatus.CANCELLED) return existing;
    this.requireScheduled(existing.status);

    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.meeting.updateMany({
        where: { id, status: MeetingStatus.SCHEDULED, lead: leadScope(user) },
        data: { status: MeetingStatus.CANCELLED },
      });
      if (changed.count === 0) {
        const current = await tx.meeting.findFirst({
          where: { id, lead: leadScope(user) },
          include: meetingInclude,
        });
        if (current?.status === MeetingStatus.CANCELLED) return current;
        if (!current) throw new NotFoundException("Meeting not found");
        throw new BadRequestException(
          "Only scheduled meetings can be cancelled",
        );
      }
      await tx.activity.create({
        data: {
          leadId: existing.leadId,
          meetingId: id,
          userId: user.sub,
          type: "MEETING_CANCELLED",
          description: "Meeting cancelled",
        },
      });
      return tx.meeting.findUniqueOrThrow({
        where: { id },
        include: meetingInclude,
      });
    });
  }

  private async findAccessible(id: string, user: Actor) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id, lead: leadScope(user) },
      include: { lead: { select: { id: true, stage: true } } },
    });
    if (!meeting) throw new NotFoundException("Meeting not found");
    return meeting;
  }

  private requireScheduled(status: MeetingStatus) {
    if (status !== MeetingStatus.SCHEDULED) {
      throw new BadRequestException(
        "Only scheduled meetings can be changed",
      );
    }
  }

  private requireLeadNextAction(
    stage: LeadStage,
    nextAction: string,
    followUpAt: Date,
  ) {
    if (
      stage !== LeadStage.WON &&
      stage !== LeadStage.LOST &&
      (!nextAction.trim() || Number.isNaN(followUpAt.getTime()))
    ) {
      throw new BadRequestException(
        "An open lead must have a next action and follow-up date",
      );
    }
  }

  private parseDateBoundary(value: string, exclusiveEnd: boolean) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException("Meeting filters must use YYYY-MM-DD");
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException("Invalid meeting filter date");
    }
    if (exclusiveEnd) date.setUTCDate(date.getUTCDate() + 1);
    return date;
  }
}
