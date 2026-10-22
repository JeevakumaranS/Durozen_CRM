import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { LeadStage, Prisma } from "@prisma/client";
import { Actor, assertActorRole } from "../../common/authorization/actor-role";
import {
  assertLeadHasNoOtherActiveWork,
  lockLeadActiveWork,
} from "../../common/active-lead-work";
import { leadScope } from "../../common/authorization/lead-scope";
import { PrismaService } from "../../prisma/prisma.service";
import { StageTransitionService } from "../pipeline/stage-transition.service";
import { CreateNegotiationDto } from "./dto/create-negotiation.dto";
import { UpdateNegotiationDto } from "./dto/update-negotiation.dto";

@Injectable()
export class NegotiationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: StageTransitionService,
  ) {}

  list(user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    return this.prisma.negotiation.findMany({
      where:
        user.role === "ADMIN" ? undefined : { lead: { ...leadScope(user) } },
      include: {
        lead: { include: { assignedBde: { select: { fullName: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(dto: CreateNegotiationDto, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    const lead = await this.prisma.lead.findFirst({
      where: {
        id: dto.leadId,
        ...leadScope(user),
      },
    });
    if (!lead) throw new NotFoundException("Lead not found");
    if (lead.stage === LeadStage.WON || lead.stage === LeadStage.LOST)
      throw new BadRequestException("Closed leads cannot enter negotiation");
    if (lead.stage !== LeadStage.NEGOTIATION)
      this.transitions.assertAllowed(lead.stage, LeadStage.NEGOTIATION);
    const latestProposal = await this.prisma.proposal.findFirst({
      where: { leadId: lead.id },
      orderBy: { proposalDate: "desc" },
    });
    const originalProposalAmount =
      dto.originalProposalAmount ??
      (latestProposal ? Number(latestProposal.finalAmount) : undefined);

    return this.prisma.$transaction(async (tx) => {
      await assertLeadHasNoOtherActiveWork(tx, lead.id);
      const stageChanged = lead.stage !== LeadStage.NEGOTIATION;
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          stage: LeadStage.NEGOTIATION,
          stageEnteredAt: stageChanged ? new Date() : undefined,
          nextAction: dto.nextAction,
          followUpAt: new Date(dto.followUpAt),
          activities: {
            create: {
              type: "NEGOTIATION",
              description: dto.customerConcern
                ? `Negotiation started: ${dto.customerConcern}`
                : "Negotiation started",
              user: { connect: { id: user.sub } },
            },
          },
        },
      });
      const negotiation = await tx.negotiation.create({
        data: {
          leadId: lead.id,
          originalProposalAmount,
          customerExpectedAmount: dto.customerExpectedAmount,
          negotiatedAmount: dto.negotiatedAmount,
          customerConcern: dto.customerConcern,
          nextAction: dto.nextAction,
          followUpAt: new Date(dto.followUpAt),
          remarks: dto.remarks,
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
      const followUp = await tx.followUp.create({
        data: {
          leadId: lead.id,
          dueAt: new Date(dto.followUpAt),
          type: "Negotiation",
          nextAction: dto.nextAction,
        },
      });
      await tx.$executeRaw`
        UPDATE "follow_ups"
        SET "negotiation_id" = ${negotiation.id}::uuid
        WHERE "id" = ${followUp.id}::uuid
      `;
      return negotiation;
    });
  }

  async update(id: string, dto: UpdateNegotiationDto, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    const negotiation = await this.prisma.negotiation.findFirst({
      where: {
        id,
        ...(user.role === "ADMIN" ? {} : { lead: leadScope(user) }),
      },
      include: { lead: true },
    });
    if (!negotiation) throw new NotFoundException("Negotiation not found");
    if (dto.nextAction && negotiation.responseSavedAt) {
      throw new BadRequestException(
        "A response has already been saved for this negotiation.",
      );
    }
    if (dto.nextAction === "Lost" && !dto.lostReason?.trim()) {
      throw new BadRequestException("A lost reason is required.");
    }
    if (
      dto.nextAction === "Won" &&
      (!dto.expectedTimeline?.trim() ||
        !dto.paymentStatus ||
        (dto.paymentStatus === "Advance Payment" &&
          (dto.advanceAmount === undefined || dto.advanceAmount <= 0)))
    ) {
      throw new BadRequestException(
        "Expected timeline and payment details are required to mark this negotiation Won.",
      );
    }

    const targetStage =
      dto.nextAction === "Won"
        ? LeadStage.WON
        : dto.nextAction === "Lost"
          ? LeadStage.LOST
          : undefined;
    if (targetStage) {
      this.transitions.assertAllowed(negotiation.lead.stage, targetStage);
    }
    const stageChanged =
      targetStage !== undefined && targetStage !== negotiation.lead.stage;

    return this.prisma.$transaction(async (tx) => {
      let effectivePaymentStatus = dto.paymentStatus;
      const responseSavedAt = dto.nextAction ? new Date() : undefined;
      if (responseSavedAt) {
        const responseUpdate = await tx.negotiation.updateMany({
          where: { id, responseSavedAt: null },
          data: {
            responseSavedAt,
          },
        });
        if (responseUpdate.count !== 1) {
          throw new BadRequestException(
            "A response has already been saved for this negotiation.",
          );
        }
      }

      if (targetStage) {
        await lockLeadActiveWork(tx, negotiation.leadId);
        const leadData: Prisma.LeadUpdateInput = {
          stage: targetStage,
          stageEnteredAt: stageChanged ? new Date() : undefined,
          nextAction: null,
          followUpAt: null,
          lostReason:
            targetStage === LeadStage.LOST ? dto.lostReason!.trim() : undefined,
          followUps: {
            updateMany: {
              where: { status: "PENDING" },
              data: { status: "CANCELLED" },
            },
          },
          callMessages: {
            updateMany: {
              where: { status: "PENDING" },
              data: { status: "CANCELLED" },
            },
          },
        };

        if (targetStage === LeadStage.WON) {
          const latestProposal = await tx.proposal.findFirst({
            where: { leadId: negotiation.leadId },
            orderBy: { proposalDate: "desc" },
            select: { finalAmount: true, serviceProduct: true },
          });
          const finalDealValue =
            negotiation.negotiatedAmount ??
            negotiation.originalProposalAmount ??
            latestProposal?.finalAmount;
          if (finalDealValue === undefined || finalDealValue === null) {
            throw new BadRequestException(
              "A negotiated or original proposal amount is required to mark this lead Won.",
            );
          }
          leadData.finalDealValue = finalDealValue;
          leadData.wonService = latestProposal?.serviceProduct;
          leadData.paymentStatus = dto.paymentStatus;
          const initialPaidAmount =
            dto.paymentStatus === "Fully Paid"
              ? finalDealValue
              : dto.paymentStatus === "Advance Payment"
                ? new Prisma.Decimal(dto.advanceAmount!)
                : new Prisma.Decimal(0);
          effectivePaymentStatus =
            new Prisma.Decimal(initialPaidAmount).gte(finalDealValue)
              ? "Fully Paid"
              : dto.paymentStatus;
          leadData.paidAmount = initialPaidAmount;
          leadData.advanceAmount =
            effectivePaymentStatus === "Advance Payment"
              ? dto.advanceAmount
              : null;
          leadData.confirmedAt = new Date();
          await tx.activity.create({
            data: {
              leadId: negotiation.leadId,
              userId: user.sub,
              type: "DEAL_WON",
              description: `Deal won for ${finalDealValue}`,
              outcome: `Payment status: ${effectivePaymentStatus}`,
              expectedTimeline: dto.expectedTimeline!.trim(),
            },
          });
          if (initialPaidAmount.gt(0)) {
            await tx.activity.create({
              data: {
                leadId: negotiation.leadId,
                userId: user.sub,
                type: "PAYMENT_RECEIVED",
                description: `${effectivePaymentStatus} recorded`,
                outcome: `Received ₹${initialPaidAmount.toFixed(2)}; paid ₹${initialPaidAmount.toFixed(2)} of ₹${new Prisma.Decimal(finalDealValue).toFixed(2)}; balance ₹${new Prisma.Decimal(finalDealValue).sub(initialPaidAmount).toFixed(2)}`,
                paymentAmount: initialPaidAmount,
                paymentStatus: effectivePaymentStatus,
                paymentTotal: initialPaidAmount,
                paymentBalance: new Prisma.Decimal(finalDealValue).sub(
                  initialPaidAmount,
                ),
              },
            });
          }
        }

        await tx.lead.update({
          where: { id: negotiation.leadId },
          data: leadData,
        });
      }

      return tx.negotiation.update({
        where: { id },
        data: {
          customerResponse: dto.customerResponse?.trim(),
          responseSavedAt,
          nextAction: dto.nextAction,
          remarks: dto.remarks,
          expectedTimeline:
            dto.nextAction === "Won" ? dto.expectedTimeline!.trim() : undefined,
          confirmedAt: dto.nextAction === "Won" ? new Date() : undefined,
          paymentStatus:
            dto.nextAction === "Won" ? effectivePaymentStatus : undefined,
          advanceAmount:
            dto.nextAction === "Won"
              ? effectivePaymentStatus === "Advance Payment"
                ? dto.advanceAmount
                : null
              : undefined,
        },
      });
    });
  }
}
