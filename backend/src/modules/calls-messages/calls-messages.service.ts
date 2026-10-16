import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { FollowUpStatus } from "@prisma/client";
import { Actor, assertActorRole } from "../../common/authorization/actor-role";
import { leadScope } from "../../common/authorization/lead-scope";
import { PrismaService } from "../../prisma/prisma.service";
import { CompleteCallMessageDto } from "./dto/complete-call-message.dto";
import { CreateCallMessageDto } from "./dto/create-call-message.dto";

const CONTACT_METHODS = ["Phone Call", "WhatsApp", "Email"];
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

  async list(status: string | undefined, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE"]);
    if (status && status !== "PENDING" && status !== "COMPLETED") {
      throw new BadRequestException("Invalid call or message status.");
    }
    const where = {
      lead: leadScope(user),
      ...(status === "PENDING"
        ? { status: FollowUpStatus.PENDING }
        : status === "COMPLETED"
          ? { status: FollowUpStatus.COMPLETED }
          : {}),
    };
    return this.prisma.callMessage.findMany({
      where,
      include: callMessageInclude,
      orderBy:
        status === "COMPLETED"
          ? [{ completedAt: "desc" }, { createdAt: "desc" }]
          : [{ dueAt: "asc" }, { createdAt: "asc" }],
    });
  }

  async create(dto: CreateCallMessageDto, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE"]);
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

  async complete(
    id: string,
    dto: CompleteCallMessageDto,
    user: Actor,
  ) {
    assertActorRole(user, ["ADMIN", "BDE"]);
    if (!dto.description?.trim() && !dto.outcome?.trim()) {
      throw new BadRequestException(
        "Enter call notes or an outcome before completing this task.",
      );
    }
    const existing = await this.prisma.callMessage.findFirst({
      where: { id, lead: leadScope(user) },
    });
    if (!existing) throw new NotFoundException("Call or message task not found");
    if (existing.status !== FollowUpStatus.PENDING) {
      throw new BadRequestException("Only pending call tasks can be completed.");
    }
    const updated = await this.prisma.callMessage.updateMany({
      where: { id, status: FollowUpStatus.PENDING },
      data: {
        status: FollowUpStatus.COMPLETED,
        description: dto.description?.trim() || existing.description,
        outcome: dto.outcome?.trim() || existing.outcome,
        completedAt: new Date(),
      },
    });
    if (updated.count !== 1) {
      throw new BadRequestException("This call task has already been completed.");
    }
    return this.prisma.callMessage.findUniqueOrThrow({
      where: { id },
      include: callMessageInclude,
    });
  }
}
