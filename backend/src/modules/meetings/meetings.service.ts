import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { LeadStage } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { StageTransitionService } from "../pipeline/stage-transition.service";
import { CreateMeetingDto } from "./dto/create-meeting.dto";

type Actor = { sub: string; role: string };

@Injectable()
export class MeetingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: StageTransitionService,
  ) {}

  list(date?: string, user?: Actor) {
    const start = date ? new Date(`${date}T00:00:00`) : undefined;
    const end = start ? new Date(start.getTime() + 86400000) : undefined;
    return this.prisma.meeting.findMany({
      where: {
        ...(start && end ? { meetingAt: { gte: start, lt: end } } : {}),
        ...(user?.role === "BDE" ? { lead: { assignedBdeId: user.sub } } : {}),
      },
      include: {
        lead: { include: { assignedBde: { select: { fullName: true } } } },
      },
      orderBy: { meetingAt: "asc" },
    });
  }

  async create(dto: CreateMeetingDto, user: Actor) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: dto.leadId },
    });
    if (!lead) throw new NotFoundException("Lead not found");
    if (user.role === "BDE" && lead.assignedBdeId !== user.sub)
      throw new ForbiddenException(
        "BDE users can only schedule meetings for their assigned leads",
      );
    if (lead.stage === LeadStage.WON || lead.stage === LeadStage.LOST)
      throw new BadRequestException(
        "Closed leads cannot be scheduled for meetings",
      );
    if (lead.stage !== LeadStage.MEETING)
      this.transitions.assertAllowed(lead.stage, LeadStage.MEETING);

    return this.prisma.$transaction(async (tx) => {
      const stageChanged = lead.stage !== LeadStage.MEETING;
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          stage: LeadStage.MEETING,
          stageEnteredAt: stageChanged ? new Date() : undefined,
          requirement: dto.requirement ?? undefined,
          estimatedBudget: dto.budget,
          nextAction: dto.nextAction,
          followUpAt: new Date(dto.followUpAt),
          activities: {
            create: {
              type: "MEETING",
              description: `${dto.type} scheduled for ${new Date(dto.meetingAt).toLocaleString()}`,
              userId: user.sub,
              previousStage: stageChanged ? lead.stage : undefined,
              newStage: stageChanged ? LeadStage.MEETING : undefined,
            },
          },
          followUps: {
            create: {
              dueAt: new Date(dto.followUpAt),
              type: "Meeting",
              nextAction: dto.nextAction,
            },
          },
        },
      });
      return tx.meeting.create({
        data: {
          leadId: lead.id,
          meetingAt: new Date(dto.meetingAt),
          type: dto.type,
          participants: dto.participants,
          requirement: dto.requirement,
          budget: dto.budget,
          discussionNotes: dto.discussionNotes,
          customerConcerns: dto.customerConcerns,
          nextAction: dto.nextAction,
          followUpAt: new Date(dto.followUpAt),
        },
        include: {
          lead: {
            select: {
              customerName: true,
              assignedBde: { select: { fullName: true } },
            },
          },
        },
      });
    });
  }
}
