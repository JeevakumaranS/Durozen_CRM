import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { LeadPriority, LeadStage as PrismaLeadStage } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { StageTransitionService } from "../pipeline/stage-transition.service";
import { CreateLeadDto, LeadStage } from "./dto/create-lead.dto";
import { CreateActivityDto } from "./dto/create-activity.dto";
import { UpdateLeadDto } from "./dto/update-lead.dto";
import { enforceNextAction } from "./rules/next-action.rule";

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: StageTransitionService,
  ) {}

  list(stage?: LeadStage, user?: { sub: string; role: string }) {
    return this.prisma.lead.findMany({
      where: {
        ...(stage ? { stage: stage as PrismaLeadStage } : {}),
        ...(user?.role === "BDE" ? { assignedBdeId: user.sub } : {}),
      },
      include: { assignedBde: { select: { id: true, fullName: true } } },
      orderBy: [{ followUpAt: "asc" }, { createdAt: "desc" }],
    });
  }

  async get(id: string, user?: { sub: string; role: string }) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        assignedBde: { select: { id: true, fullName: true } },
        activities: {
          include: { user: { select: { fullName: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!lead) throw new NotFoundException("Lead not found");
    if (user?.role === "BDE" && lead.assignedBdeId !== user.sub) {
      throw new ForbiddenException(
        "BDE users can only view their assigned leads",
      );
    }
    return lead;
  }

  assignees(user?: { sub: string; role: string }) {
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        ...(user?.role === "BDE" ? { id: user.sub } : { role: "BDE" }),
      },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: "asc" },
    });
  }

  async addActivity(
    id: string,
    dto: CreateActivityDto,
    user?: { sub: string; role: string },
  ) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException("Lead not found");
    if (user?.role === "BDE" && lead.assignedBdeId !== user.sub) {
      throw new ForbiddenException(
        "BDE users can only update their assigned leads",
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const activity = await tx.activity.create({
        data: {
          leadId: id,
          userId: user?.sub ?? lead.assignedBdeId,
          type: dto.type,
          description: dto.description,
          outcome: dto.outcome,
          nextAction: dto.nextAction,
        },
        include: { user: { select: { fullName: true } } },
      });
      if (
        lead.stage !== "WON" &&
        lead.stage !== "LOST" &&
        (dto.nextAction || dto.followUpAt)
      ) {
        const nextDate = dto.followUpAt
          ? new Date(dto.followUpAt)
          : lead.followUpAt;
        enforceNextAction(
          lead.stage,
          dto.nextAction ?? lead.nextAction ?? undefined,
          nextDate ?? undefined,
        );
        await tx.lead.update({
          where: { id },
          data: {
            nextAction: dto.nextAction,
            followUpAt: dto.followUpAt ? nextDate : undefined,
            ...(dto.followUpAt
              ? {
                  followUps: {
                    create: {
                      dueAt: nextDate!,
                      type: dto.type,
                      nextAction: dto.nextAction ?? lead.nextAction!,
                    },
                  },
                }
              : {}),
          },
        });
      }
      return activity;
    });
  }

  async create(dto: CreateLeadDto, actorId = dto.assignedBdeId) {
    const stage = LeadStage.NEW_LEAD as PrismaLeadStage;
    enforceNextAction(stage, dto.nextAction, new Date(dto.followUpAt));
    const bde = await this.prisma.user.findFirst({
      where: { id: dto.assignedBdeId, isActive: true },
    });
    if (!bde) throw new BadRequestException("Assigned BDE does not exist");
    const duplicate = await this.prisma.lead.findFirst({
      where: {
        mobileNumber: dto.mobileNumber,
        stage: { notIn: ["WON", "LOST"] },
      },
    });
    if (duplicate)
      throw new BadRequestException(
        "An active lead already uses this mobile number",
      );

    return this.prisma.lead.create({
      data: {
        leadNumber: `DZN-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
        customerName: dto.customerName,
        businessName: dto.businessName,
        businessCategory: dto.businessCategory,
        mobileNumber: dto.mobileNumber,
        email: dto.email,
        location: dto.location,
        leadSource: dto.leadSource,
        priority: (dto.priority ?? "WARM") as LeadPriority,
        estimatedBudget: dto.estimatedBudget,
        assignedBdeId: dto.assignedBdeId,
        stage,
        nextAction: dto.nextAction,
        followUpAt: new Date(dto.followUpAt),
        requirement: dto.requirement,
        activities: {
          create: {
            type: "NOTE",
            description: "Lead created",
            userId: actorId,
            newStage: stage,
          },
        },
        followUps: {
          create: {
            dueAt: new Date(dto.followUpAt),
            type: "Call",
            nextAction: dto.nextAction,
          },
        },
      },
      include: { assignedBde: { select: { id: true, fullName: true } } },
    });
  }

  async update(
    id: string,
    dto: UpdateLeadDto,
    user?: { sub: string; role: string },
  ) {
    const existing = await this.prisma.lead.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Lead not found");
    if (user?.role === "BDE" && existing.assignedBdeId !== user.sub) {
      throw new ForbiddenException(
        "BDE users can only update their assigned leads",
      );
    }
    if (
      user?.role === "BDE" &&
      dto.assignedBdeId &&
      dto.assignedBdeId !== user.sub
    ) {
      throw new ForbiddenException("BDE users cannot reassign leads");
    }

    const nextStage = (dto.stage ?? existing.stage) as PrismaLeadStage;
    if (dto.stage && nextStage !== existing.stage)
      this.transitions.assertAllowed(existing.stage, nextStage);
    const nextAction = dto.nextAction ?? existing.nextAction ?? undefined;
    const followUpAt = dto.followUpAt
      ? new Date(dto.followUpAt)
      : (existing.followUpAt ?? undefined);
    enforceNextAction(nextStage, nextAction, followUpAt);
    if (dto.assignedBdeId) {
      const assignee = await this.prisma.user.findFirst({
        where: { id: dto.assignedBdeId, isActive: true },
      });
      if (!assignee)
        throw new BadRequestException("Assigned BDE does not exist");
    }
    if (
      nextStage === "WON" &&
      dto.finalDealValue === undefined &&
      existing.finalDealValue === null
    ) {
      throw new BadRequestException(
        "A final deal value is required to mark a lead as WON",
      );
    }
    if (dto.mobileNumber && dto.mobileNumber !== existing.mobileNumber) {
      const duplicate = await this.prisma.lead.findFirst({
        where: {
          id: { not: id },
          mobileNumber: dto.mobileNumber,
          stage: { notIn: ["WON", "LOST"] },
        },
      });
      if (duplicate) {
        throw new BadRequestException(
          "An active lead already uses this mobile number",
        );
      }
    }
    if (
      nextStage === "LOST" &&
      !dto.lostReason?.trim() &&
      !existing.lostReason?.trim()
    ) {
      throw new BadRequestException(
        "A lost reason is required to mark a lead as LOST",
      );
    }

    const stageChanged = nextStage !== existing.stage;
    return this.prisma.lead.update({
      where: { id },
      data: {
        customerName: dto.customerName,
        businessName: dto.businessName,
        businessCategory: dto.businessCategory,
        mobileNumber: dto.mobileNumber,
        email: dto.email,
        location: dto.location,
        leadSource: dto.leadSource,
        priority: dto.priority as LeadPriority | undefined,
        estimatedBudget: dto.estimatedBudget,
        assignedBdeId: dto.assignedBdeId,
        stage: nextStage,
        nextAction: dto.nextAction,
        followUpAt: dto.followUpAt ? new Date(dto.followUpAt) : undefined,
        requirement: dto.requirement,
        finalDealValue: dto.finalDealValue,
        wonService: dto.wonService,
        paymentStatus: dto.paymentStatus,
        expectedStartDate: dto.expectedStartDate
          ? new Date(dto.expectedStartDate)
          : undefined,
        wonRemarks: dto.wonRemarks,
        lostReason: dto.lostReason,
        stageEnteredAt: stageChanged ? new Date() : undefined,
        activities: stageChanged
          ? {
              create: {
                type: "STAGE_CHANGE",
                description: `Stage changed from ${existing.stage} to ${nextStage}`,
                userId:
                  user?.sub ?? dto.assignedBdeId ?? existing.assignedBdeId,
                previousStage: existing.stage,
                newStage: nextStage,
              },
            }
          : undefined,
        followUps:
          nextStage === "WON" || nextStage === "LOST"
            ? {
                updateMany: {
                  where: { status: "PENDING" },
                  data: { status: "CANCELLED" },
                },
              }
            : dto.followUpAt || dto.nextAction
              ? {
                  create: {
                    dueAt: dto.followUpAt
                      ? new Date(dto.followUpAt)
                      : existing.followUpAt!,
                    type: "Call",
                    nextAction: dto.nextAction ?? existing.nextAction!,
                  },
                }
              : undefined,
      },
      include: { assignedBde: { select: { id: true, fullName: true } } },
    });
  }
}
