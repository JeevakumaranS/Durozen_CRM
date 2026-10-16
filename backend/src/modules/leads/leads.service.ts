import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  LeadPriority,
  LeadStage as PrismaLeadStage,
  Prisma,
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { Actor, assertActorRole } from "../../common/authorization/actor-role";
import { leadScope } from "../../common/authorization/lead-scope";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateLeadDto, LeadStage } from "./dto/create-lead.dto";
import { CreateActivityDto } from "./dto/create-activity.dto";
import { UpdateLeadDto } from "./dto/update-lead.dto";
import { enforceNextAction } from "./rules/next-action.rule";
import { StageTransitionService } from "../pipeline/stage-transition.service";

const CALL_MESSAGE_METHODS = new Set(["Phone Call", "WhatsApp", "Email"]);
const SALES_TASK_TYPES = new Set(["Proposal Follow-up", "Negotiation"]);
const activityContactMethod = (activityType: string) =>
  activityType === "Call" ? "Phone Call" : activityType;

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: StageTransitionService,
  ) {}

  list(stage: LeadStage | undefined, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    return this.prisma.lead.findMany({
      where: {
        ...(stage ? { stage: stage as PrismaLeadStage } : {}),
        ...leadScope(user),
      },
      include: { assignedBde: { select: { id: true, fullName: true } } },
      orderBy: [{ followUpAt: "asc" }, { createdAt: "desc" }],
    });
  }

  async get(id: string, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    const lead = await this.prisma.lead.findFirst({
      where: {
        id,
        ...leadScope(user),
      },
      include: {
        assignedBde: { select: { id: true, fullName: true } },
        activities: {
          include: { user: { select: { fullName: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!lead) throw new NotFoundException("Lead not found");
    return lead;
  }

  async delete(id: string, user: Actor) {
    assertActorRole(user, ["ADMIN"]);
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!lead) throw new NotFoundException("Lead not found");
    await this.prisma.lead.delete({ where: { id } });
    return { id, deleted: true };
  }

  assignees(user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        ...(user.role === "BDE"
          ? { id: user.sub }
          : {
              role: "BDE",
              ...(user.role === "SALES_MANAGER"
                ? { managerId: user.sub }
                : {}),
            }),
      },
      select: { id: true, fullName: true, role: true },
      orderBy: { fullName: "asc" },
    });
  }

  async addActivity(
    id: string,
    dto: CreateActivityDto,
    user: Actor,
  ) {
    assertActorRole(user, ["ADMIN", "BDE"]);
    const lead = await this.prisma.lead.findFirst({
      where: {
        id,
        ...leadScope(user),
      },
    });
    if (!lead) throw new NotFoundException("Lead not found");
    return this.prisma.$transaction(async (tx) => {
      const activity = await tx.activity.create({
        data: {
          leadId: id,
          userId: user.sub,
          type: dto.type,
          description: dto.description,
          outcome: dto.outcome,
          nextAction: dto.nextAction,
        },
        include: { user: { select: { fullName: true } } },
      });
      const contactMethod = activityContactMethod(dto.type);
      if (CALL_MESSAGE_METHODS.has(contactMethod)) {
        const completedAt = new Date();
        await tx.callMessage.create({
          data: {
            leadId: id,
            userId: user.sub,
            dueAt: completedAt,
            contactMethod,
            description: dto.description,
            outcome: dto.outcome,
            status: "COMPLETED",
            completedAt,
          },
        });
      }
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
            ...(nextDate &&
            dto.nextAction &&
            CALL_MESSAGE_METHODS.has(dto.nextAction)
              ? {
                  callMessages: {
                    create: {
                      userId: user.sub,
                      dueAt: nextDate,
                      contactMethod: dto.nextAction,
                    },
                  },
                }
              : {}),
            ...(nextDate && SALES_TASK_TYPES.has(dto.type)
              ? {
                  followUps: {
                    create: {
                      dueAt: nextDate,
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

  async create(dto: CreateLeadDto, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    const assignedBdeId =
      user.role === "BDE" ? user.sub : dto.assignedBdeId;
    const stage = (dto.stage ?? LeadStage.NEW_LEAD) as PrismaLeadStage;
    const followUpAt = dto.followUpAt
      ? new Date(dto.followUpAt)
      : undefined;
    enforceNextAction(stage, dto.nextAction, followUpAt);
    if (
      stage === LeadStage.WON &&
      (dto.finalDealValue === undefined || !dto.wonService?.trim())
    ) {
      throw new BadRequestException(
        "A final deal value and service are required to create a WON lead",
      );
    }
    if (stage === LeadStage.LOST && !dto.lostReason?.trim()) {
      throw new BadRequestException(
        "A lost reason is required to create a LOST lead",
      );
    }
    const bde = await this.prisma.user.findFirst({
      where: {
        id: assignedBdeId,
        isActive: true,
        role: "BDE",
        ...(user.role === "SALES_MANAGER" ? { managerId: user.sub } : {}),
      },
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
        leadDate: dto.leadDate ? new Date(dto.leadDate) : new Date(),
        customerName: dto.customerName,
        businessName: dto.businessName,
        businessCategory: dto.businessCategory,
        mobileNumber: dto.mobileNumber,
        email: dto.email,
        location: dto.location,
        leadSource: dto.leadSource,
        priority: (dto.priority ?? "WARM") as LeadPriority,
        estimatedBudget:
          dto.estimatedBudget === undefined
            ? undefined
            : dto.estimatedBudget === null
              ? null
              : new Prisma.Decimal(dto.estimatedBudget),
        assignedBdeId,
        stage,
        nextAction: dto.nextAction,
        followUpAt,
        remarks: dto.remarks,
        requirement: dto.requirement,
        finalDealValue: dto.finalDealValue,
        wonService: dto.wonService,
        paymentStatus: dto.paymentStatus,
        expectedStartDate: dto.expectedStartDate
          ? new Date(dto.expectedStartDate)
          : undefined,
        wonRemarks: dto.wonRemarks,
        lostReason: dto.lostReason,
        activities: {
          create: {
            type: "NOTE",
            description: "Lead created",
            user: { connect: { id: user.sub } },
          },
        },
        callMessages: CALL_MESSAGE_METHODS.has(dto.nextAction)
          ? {
              create: {
                userId: user.sub,
                dueAt: followUpAt!,
                contactMethod: dto.nextAction,
              },
            }
          : undefined,
        followUps: SALES_TASK_TYPES.has(dto.nextAction)
          ? {
              create: {
                dueAt: followUpAt!,
                type: dto.nextAction,
                nextAction: dto.nextAction,
              },
            }
          : undefined,
      },
      include: { assignedBde: { select: { id: true, fullName: true } } },
    });
  }

  async update(
    id: string,
    dto: UpdateLeadDto,
    user: Actor,
  ) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    const existing = await this.prisma.lead.findFirst({
      where: {
        id,
        ...leadScope(user),
      },
    });
    if (!existing) throw new NotFoundException("Lead not found");
    if (
      user.role === "BDE" &&
      dto.assignedBdeId &&
      dto.assignedBdeId !== user.sub
    ) {
      throw new ForbiddenException("BDE users cannot reassign leads");
    }
    if (user.role === "SALES_MANAGER" && dto.assignedBdeId) {
      const teamBde = await this.prisma.user.findFirst({
        where: {
          id: dto.assignedBdeId,
          role: "BDE",
          isActive: true,
          managerId: user.sub,
        },
        select: { id: true },
      });
      if (!teamBde) {
        throw new ForbiddenException(
          "Sales Managers can only assign leads to their own BDE team",
        );
      }
    }

    const nextStage = (dto.stage ?? existing.stage) as PrismaLeadStage;
    const nextAction = dto.nextAction ?? existing.nextAction ?? undefined;
    const followUpAt = dto.followUpAt
      ? new Date(dto.followUpAt)
      : (existing.followUpAt ?? undefined);
    enforceNextAction(nextStage, nextAction, followUpAt);
    if (dto.assignedBdeId) {
      const assignee = await this.prisma.user.findFirst({
        where: {
          id: dto.assignedBdeId,
          isActive: true,
          role: "BDE",
          ...(user.role === "SALES_MANAGER"
            ? { managerId: user.sub }
            : {}),
        },
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
    if (stageChanged) {
      this.transitions.assertAllowed(existing.stage, nextStage);
    }
    const requiresContactDetails =
      (existing.stage === "NEW_LEAD" &&
        ["CONTACTED", "INTERESTED"].includes(nextStage)) ||
      (existing.stage === "CONTACTED" && nextStage === "INTERESTED");
    if (
      requiresContactDetails &&
      (!dto.contactDate?.trim() ||
        !dto.contactType?.trim() ||
        !dto.customerResponse?.trim())
    ) {
      throw new BadRequestException(
        "Contact date, contact type, and customer response are required for this stage change",
      );
    }
    const followUpChanged =
      (dto.followUpAt !== undefined &&
        new Date(dto.followUpAt).getTime() !==
          existing.followUpAt?.getTime()) ||
      (dto.nextAction !== undefined && dto.nextAction !== existing.nextAction);
    return this.prisma.lead.update({
      where: { id },
      data: {
        customerName: dto.customerName,
        businessName: dto.businessName,
        leadDate: dto.leadDate ? new Date(dto.leadDate) : undefined,
        businessCategory: dto.businessCategory,
        mobileNumber: dto.mobileNumber,
        email: dto.email,
        location: dto.location,
        leadSource: dto.leadSource,
        priority: dto.priority as LeadPriority | undefined,
        estimatedBudget:
          dto.estimatedBudget === undefined
            ? undefined
            : dto.estimatedBudget === null
              ? null
              : new Prisma.Decimal(dto.estimatedBudget),
        assignedBdeId: dto.assignedBdeId,
        stage: nextStage,
        nextAction: dto.nextAction,
        followUpAt: dto.followUpAt ? new Date(dto.followUpAt) : undefined,
        remarks: dto.remarks,
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
        activities: requiresContactDetails
          ? {
              create: [
                {
                  type:
                    nextStage === "CONTACTED" ? "CONTACT" : "QUALIFICATION",
                  description:
                    nextStage === "CONTACTED"
                      ? "Customer contact recorded"
                      : "Customer interest confirmed",
                  outcome: dto.customerResponse,
                  contactDate: new Date(dto.contactDate!),
                  contactType: dto.contactType,
                  customerResponse: dto.customerResponse,
                  expectedTimeline: dto.expectedTimeline,
                  user: { connect: { id: user.sub } },
                },
              ],
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
            : followUpChanged
              ? {
                  updateMany: {
                    where: { status: "PENDING" },
                    data: { status: "CANCELLED" },
                  },
                  ...(dto.nextAction && SALES_TASK_TYPES.has(dto.nextAction)
                    ? {
                        create: {
                          dueAt: dto.followUpAt
                            ? new Date(dto.followUpAt)
                            : existing.followUpAt!,
                          type: dto.nextAction,
                          nextAction: dto.nextAction,
                        },
                      }
                    : {}),
                }
              : undefined,
        callMessages:
          nextStage === "WON" || nextStage === "LOST"
            ? {
                updateMany: {
                  where: { status: "PENDING" },
                  data: { status: "CANCELLED" },
                },
              }
            : followUpChanged
              ? {
                  updateMany: {
                    where: { status: "PENDING" },
                    data: { status: "CANCELLED" },
                  },
                  ...(dto.nextAction &&
                  CALL_MESSAGE_METHODS.has(dto.nextAction)
                    ? {
                        create: {
                          userId: user.sub,
                          dueAt: dto.followUpAt
                            ? new Date(dto.followUpAt)
                            : existing.followUpAt!,
                          contactMethod: dto.nextAction,
                        },
                      }
                    : {}),
                }
              : undefined,
      },
      include: { assignedBde: { select: { id: true, fullName: true } } },
    });
  }
}
