import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { FollowUpStatus, LeadStage, Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateFollowUpDto } from "./dto/create-follow-up.dto";
import { UpdateFollowUpDto } from "./dto/update-follow-up.dto";

@Injectable()
export class FollowUpsService {
  constructor(private readonly prisma: PrismaService) {}

  list(scope?: string, user?: { sub: string; role: string }) {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const tomorrow = new Date(start);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const where: Prisma.FollowUpWhereInput =
      scope === "today"
        ? {
            status: FollowUpStatus.PENDING,
            dueAt: { gte: start, lt: tomorrow },
          }
        : scope === "overdue"
          ? { status: FollowUpStatus.PENDING, dueAt: { lt: start } }
          : scope === "upcoming"
            ? { status: FollowUpStatus.PENDING, dueAt: { gte: tomorrow } }
            : scope === "completed"
              ? { status: FollowUpStatus.COMPLETED }
              : {};
    if (user?.role === "BDE") where.lead = { assignedBdeId: user.sub };

    return this.prisma.followUp.findMany({
      where,
      include: {
        lead: {
          select: {
            id: true,
            customerName: true,
            mobileNumber: true,
            stage: true,
            assignedBde: { select: { fullName: true } },
          },
        },
      },
      orderBy: { dueAt: "asc" },
    });
  }

  async create(dto: CreateFollowUpDto, user?: { sub: string; role: string }) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: dto.leadId },
    });
    if (!lead) throw new NotFoundException("Lead not found");
    if (user?.role === "BDE" && lead.assignedBdeId !== user.sub) {
      throw new ForbiddenException(
        "BDE users can only schedule follow-ups for their assigned leads",
      );
    }
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

  async update(
    id: string,
    dto: UpdateFollowUpDto,
    user?: { sub: string; role: string },
  ) {
    const existing = await this.prisma.followUp.findUnique({
      where: { id },
      include: { lead: true },
    });
    if (!existing) throw new NotFoundException("Follow-up not found");
    if (user?.role === "BDE" && existing.lead.assignedBdeId !== user.sub) {
      throw new ForbiddenException(
        "BDE users can only update follow-ups for their assigned leads",
      );
    }

    const activeLead =
      existing.lead.stage !== LeadStage.WON &&
      existing.lead.stage !== LeadStage.LOST;
    const schedulesNext =
      dto.status === FollowUpStatus.COMPLETED ||
      dto.status === FollowUpStatus.RESCHEDULED ||
      dto.status === FollowUpStatus.CANCELLED;
    if (
      activeLead &&
      schedulesNext &&
      (!dto.dueAt || !dto.nextAction?.trim())
    ) {
      throw new BadRequestException(
        "Set the next action and follow-up date before closing this follow-up.",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.followUp.update({
        where: { id },
        data: { status: dto.status, remarks: dto.remarks ?? existing.remarks },
      });
      if (activeLead && schedulesNext && dto.dueAt && dto.nextAction) {
        await tx.followUp.create({
          data: {
            leadId: existing.leadId,
            dueAt: new Date(dto.dueAt),
            type: existing.type,
            nextAction: dto.nextAction,
            remarks: dto.remarks,
          },
        });
        await tx.lead.update({
          where: { id: existing.leadId },
          data: { followUpAt: new Date(dto.dueAt), nextAction: dto.nextAction },
        });
      } else if (
        dto.status === FollowUpStatus.PENDING &&
        (dto.dueAt || dto.nextAction)
      ) {
        await tx.followUp.update({
          where: { id },
          data: {
            dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
            nextAction: dto.nextAction,
          },
        });
      }
      return updated;
    });
  }
}
