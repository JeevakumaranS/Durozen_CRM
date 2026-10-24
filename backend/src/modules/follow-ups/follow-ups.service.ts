import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { FollowUpStatus, LeadStage, Prisma } from "@prisma/client";
import { Actor, assertActorRole } from "../../common/authorization/actor-role";
import { formatBusinessDateTime } from "../../common/business-time";
import {
  assertLeadHasNoOtherActiveWork,
  lockLeadActiveWork,
} from "../../common/active-lead-work";
import { leadScope } from "../../common/authorization/lead-scope";
import {
  businessDateParts,
  businessDateTime,
  startOfBusinessDay,
} from "../../common/utils/business-time";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateFollowUpDto } from "./dto/create-follow-up.dto";
import { UpdateFollowUpDto } from "./dto/update-follow-up.dto";
import { proposalActivityDescription } from "../proposals/proposal-activity";
import { canTransition } from "../pipeline/stage-rules";

type FollowUpFilters = {
  scope?: string;
  search?: string;
  type?: string;
  assignedBdeId?: string;
  status?: string;
  pendingResponse?: string;
  from?: string;
  to?: string;
};

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
  return businessDateTime(
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
    const todayParts = businessDateParts(start);
    const tomorrowDate = new Date(
      Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day + 1),
    );
    const tomorrow = businessDateTime(
      tomorrowDate.getUTCFullYear(),
      tomorrowDate.getUTCMonth() + 1,
      tomorrowDate.getUTCDate(),
    );
    const allowedScopes = ["today", "overdue", "upcoming", "completed"];
    if (filters.scope && !allowedScopes.includes(filters.scope)) {
      throw new BadRequestException("Invalid follow-up scope.");
    }
    const statuses = filters.status
      ?.split(",")
      .filter(Boolean) as FollowUpStatus[] | undefined;
    if (
      statuses?.some(
        (status) => !Object.values(FollowUpStatus).includes(status),
      )
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
      {
        NOT: {
          status: FollowUpStatus.PENDING,
          type: "Proposal Follow-up",
          nextAction: "Follow up on proposal",
          lead: {
            followUps: {
              some: {
                status: FollowUpStatus.COMPLETED,
                type: "Proposal Follow-up",
                nextAction: "Follow up on proposal",
              },
            },
          },
        },
      },
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
    if (statuses?.length) {
      conditions.push({ status: { in: statuses } });
    }
    if (filters.pendingResponse === "true") {
      conditions.push({
        OR: [
          {
            AND: [
              { type: "Proposal Follow-up" },
              {
                OR: [
                  { proposal: { is: { responseSavedAt: null } } },
                  {
                    proposalId: null,
                    lead: {
                      proposals: {
                        some: { responseSavedAt: null },
                      },
                    },
                  },
                ],
              },
            ],
          },
          {
            AND: [
              { type: "Negotiation" },
              {
                OR: [
                  { negotiation: { is: { responseSavedAt: null } } },
                  {
                    negotiationId: null,
                    lead: {
                      negotiations: {
                        some: { responseSavedAt: null },
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      });
    } else if (
      filters.pendingResponse !== undefined &&
      filters.pendingResponse !== "false"
    ) {
      throw new BadRequestException("Invalid pending response filter.");
    }
    const types = filters.type
      ?.split(",")
      .map((type) => type.trim())
      .filter(Boolean);
    if (types?.length) {
      conditions.push({ type: { in: types } });
    }
    if (filters.assignedBdeId) {
      const assignedBdeIds = filters.assignedBdeId
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      conditions.push({
        lead: {
          assignedBdeId:
            assignedBdeIds.length === 1
              ? assignedBdeIds[0]
              : { in: assignedBdeIds },
        },
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
        proposal: {
          select: {
            id: true,
            customerResponse: true,
            responseSavedAt: true,
          },
        },
        negotiation: {
          select: {
            id: true,
            originalProposalAmount: true,
            customerExpectedAmount: true,
            negotiatedAmount: true,
            expectedTimeline: true,
            confirmedAt: true,
            paymentStatus: true,
            advanceAmount: true,
          },
        },
        lead: {
          select: {
            id: true,
            customerName: true,
            businessName: true,
            mobileNumber: true,
            stage: true,
            assignedBde: { select: { id: true, fullName: true } },
            negotiations: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                id: true,
                customerResponse: true,
                responseSavedAt: true,
                nextAction: true,
              },
            },
            activities: {
              where: { contactType: { not: null } },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { contactType: true, customerResponse: true },
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
    const todayParts = businessDateParts(start);
    const tomorrowDate = new Date(
      Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day + 1),
    );
    const tomorrow = businessDateTime(
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

  async pendingProposalForLead(leadId: string, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    return this.prisma.followUp.findFirst({
      where: {
        leadId,
        type: "Proposal Follow-up",
        status: FollowUpStatus.PENDING,
        lead: leadScope(user),
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
  }

  async create(dto: CreateFollowUpDto, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    if (!["Proposal Follow-up", "Negotiation"].includes(dto.type)) {
      throw new BadRequestException(
        "Follow-ups can only be created for proposals or negotiations.",
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
      await assertLeadHasNoOtherActiveWork(tx, lead.id);
      const negotiation =
        dto.type === "Negotiation"
          ? await tx.negotiation.findFirst({
              where: { leadId: lead.id },
              orderBy: { createdAt: "desc" },
              select: { id: true },
            })
          : null;
      const followUp = await tx.followUp.create({
        data: {
          leadId: lead.id,
          dueAt: new Date(dto.dueAt),
          type: dto.type,
          nextAction: dto.nextAction,
          remarks: dto.remarks,
        },
      });
      if (negotiation) {
        await tx.$executeRaw`
          UPDATE "follow_ups"
          SET "negotiation_id" = ${negotiation.id}::uuid
          WHERE "id" = ${followUp.id}::uuid
        `;
      }
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
      assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    }
    const existing = await this.prisma.followUp.findFirst({
      where: {
        id,
        lead: leadScope(user),
      },
      include: { lead: true, negotiation: true },
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
    const isProposalCompletion =
      dto.status === FollowUpStatus.COMPLETED &&
      dto.nextStage === LeadStage.PROPOSAL;
    const isNegotiationCompletion =
      dto.status === FollowUpStatus.COMPLETED &&
      existing.type === "Negotiation";
    if (
      isProposalCompletion &&
      (existing.type !== "Proposal Follow-up" ||
        existing.lead.stage !== LeadStage.MEETING)
    ) {
      throw new BadRequestException(
        "A proposal can only be prepared from a meeting-stage proposal follow-up.",
      );
    }
    if (
      isProposalCompletion &&
      (!dto.proposalDate ||
        !dto.serviceProduct?.trim() ||
        dto.proposalAmount === undefined ||
        !dto.dueAt)
    ) {
      throw new BadRequestException(
        "Proposal date, service or product, proposal amount, and next follow-up are required.",
      );
    }
    if (
      isProposalCompletion &&
      (dto.discount ?? 0) > (dto.proposalAmount ?? 0)
    ) {
      throw new BadRequestException(
        "Discount cannot exceed proposal amount.",
      );
    }
    if (
      isNegotiationCompletion &&
      dto.negotiatedAmount === undefined
    ) {
      throw new BadRequestException(
        "Negotiated amount is required.",
      );
    }
    if (
      !isProposalCompletion &&
      !isNegotiationCompletion &&
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
      const dueParts = businessDateParts(new Date(dto.dueAt));
      const todayParts = businessDateParts(new Date());
      const dueDate = `${dueParts.year}-${String(dueParts.month).padStart(2, "0")}-${String(dueParts.day).padStart(2, "0")}`;
      const today = `${todayParts.year}-${String(todayParts.month).padStart(2, "0")}-${String(todayParts.day).padStart(2, "0")}`;
      if (dueDate < today) {
        throw new BadRequestException(
          "The next follow-up date cannot be in the past.",
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (
        (isProposalCompletion || dto.scheduleMeeting) &&
        dto.status === FollowUpStatus.COMPLETED
      ) {
        await assertLeadHasNoOtherActiveWork(tx, existing.leadId, {
          followUpId: existing.id,
        });
      } else if (
        dto.status === FollowUpStatus.RESCHEDULED &&
        activeLead &&
        closesPending
      ) {
        await assertLeadHasNoOtherActiveWork(tx, existing.leadId, {
          followUpId: existing.id,
        });
      } else {
        await lockLeadActiveWork(tx, existing.leadId);
      }
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
          ...(isNegotiationCompletion
            ? { nextAction: dto.nextAction }
            : {}),
        },
      });
      if (transition.count !== 1) {
        throw new BadRequestException(
          "This follow-up has already been updated.",
        );
      }
      if (isProposalCompletion) {
        const discount = dto.discount ?? 0;
        const proposalDate = new Date(dto.proposalDate!);
        const proposalAmount = new Prisma.Decimal(dto.proposalAmount!);
        const discountAmount = new Prisma.Decimal(discount);
        const finalAmount = proposalAmount.minus(discountAmount);
        const proposalFollowUpAt = new Date(dto.dueAt!);
        const proposal = await tx.proposal.create({
          data: {
            leadId: existing.leadId,
            proposalDate,
            serviceProduct: dto.serviceProduct!,
            proposalAmount,
            discount: discountAmount,
            tax: 0,
            finalAmount,
            followUpAt: proposalFollowUpAt,
          },
        });
        await tx.followUp.update({
          where: { id },
          data: { proposalId: proposal.id },
        });
        await tx.activity.create({
          data: {
            leadId: existing.leadId,
            userId: user.sub,
            type: "PROPOSAL_SENT",
            description: proposalActivityDescription({
              leadNumber: existing.lead.leadNumber,
              serviceProduct: dto.serviceProduct!.trim(),
              proposalDate,
              proposalAmount: proposalAmount.toString(),
              discount: discountAmount.toString(),
              tax: "0",
              finalAmount: finalAmount.toString(),
              followUpAt: proposalFollowUpAt,
              nextAction: dto.nextAction ?? "Follow up on proposal",
              remarks: dto.remarks,
            }),
            contactDate: proposalDate,
            contactType: "Proposal",
            nextAction: dto.nextAction ?? "Follow up on proposal",
            followUpAt: proposalFollowUpAt,
            remarks: dto.remarks?.trim() || undefined,
          },
        });
      } else if (isNegotiationCompletion) {
        if (!existing.negotiation) {
          throw new BadRequestException(
            "The negotiation record for this follow-up could not be found.",
          );
        }
        await tx.negotiation.update({
          where: { id: existing.negotiation.id },
          data: {
            negotiatedAmount: dto.negotiatedAmount,
          },
        });
        await tx.activity.create({
          data: {
            leadId: existing.leadId,
            userId: user.sub,
            type: "NEGOTIATION",
            description: "Negotiation follow-up completed",
            outcome: `Negotiated amount: ${dto.negotiatedAmount}`,
          },
        });
      } else if (dto.status === FollowUpStatus.COMPLETED) {
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
            description: `${meeting.type} scheduled for ${formatBusinessDateTime(meeting.meetingAt)}`,
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
      } else if (
        !isProposalCompletion &&
        !isNegotiationCompletion &&
        activeLead &&
        closesPending &&
        dto.dueAt &&
        dto.nextAction
      ) {
        const successor = await tx.followUp.create({
          data: {
            leadId: existing.leadId,
            meetingId: existing.meetingId,
            dueAt: new Date(dto.dueAt),
            type: existing.type,
            nextAction: dto.nextAction,
          },
        });
        if (existing.type === "Negotiation") {
          await tx.$executeRaw`
            UPDATE "follow_ups" AS successor
            SET "negotiation_id" = source."negotiation_id"
            FROM "follow_ups" AS source
            WHERE successor."id" = ${successor.id}::uuid
              AND source."id" = ${existing.id}::uuid
          `;
        }
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
            finalDealValue:
              isNegotiationCompletion && nextStage === LeadStage.WON
                ? dto.negotiatedAmount
                : undefined,
            paymentStatus:
              isNegotiationCompletion && nextStage === LeadStage.WON
                ? dto.paymentStatus
                : undefined,
            advanceAmount:
              isNegotiationCompletion && nextStage === LeadStage.WON
                ? dto.paymentStatus === "Advance Amount"
                  ? dto.advanceAmount
                  : null
                : undefined,
            confirmedAt:
              isNegotiationCompletion && nextStage === LeadStage.WON
                ? new Date(dto.confirmedAt!)
                : undefined,
            nextAction: isProposalCompletion
              ? "Follow up on proposal"
              : dto.scheduleMeeting
                ? undefined
                : isNegotiationCompletion
                  ? null
                : !isProposalCompletion &&
                    activeLead &&
                    closesPending &&
                    dto.dueAt &&
                    dto.nextAction
                  ? dto.nextAction
                  : null,
            followUpAt: isProposalCompletion
              ? new Date(dto.dueAt!)
              : dto.scheduleMeeting
                ? undefined
                : isNegotiationCompletion
                  ? null
                : !isProposalCompletion &&
                    activeLead &&
                    closesPending &&
                    dto.dueAt &&
                    dto.nextAction
                  ? new Date(dto.dueAt)
                  : null,
          },
          select: { id: true, stage: true },
        });
        if (leadUpdate.stage !== nextStage) {
          throw new BadRequestException(
            `Lead stage was not updated to ${nextStage}.`,
          );
        }
        if (nextStage === LeadStage.WON || nextStage === LeadStage.LOST) {
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
