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
import { CreateProposalDto } from "./dto/create-proposal.dto";
import { UpdateProposalDto } from "./dto/update-proposal.dto";
import { proposalActivityDescription } from "./proposal-activity";

@Injectable()
export class ProposalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: StageTransitionService,
  ) {}

  list(user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    return this.prisma.proposal.findMany({
      where:
        user.role === "ADMIN" ? undefined : { lead: leadScope(user) },
      include: {
        lead: { include: { assignedBde: { select: { fullName: true } } } },
      },
      orderBy: { proposalDate: "desc" },
    });
  }

  async latestAmountForLead(leadId: string, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, ...leadScope(user) },
      select: { id: true },
    });
    if (!lead) throw new NotFoundException("Lead not found");

    const proposal = await this.prisma.proposal.findFirst({
      where: { leadId: lead.id },
      orderBy: { proposalDate: "desc" },
      select: { id: true, finalAmount: true, serviceProduct: true },
    });
    if (!proposal) throw new NotFoundException("No proposal found for this lead");
    return {
      id: proposal.id,
      originalProposalAmount: Number(proposal.finalAmount),
      serviceProduct: proposal.serviceProduct,
    };
  }

  async create(dto: CreateProposalDto, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    const proposalAmount = new Prisma.Decimal(dto.proposalAmount);
    const discount = new Prisma.Decimal(dto.discount ?? 0);
    const tax = new Prisma.Decimal(dto.tax ?? 0);
    if (discount.gt(proposalAmount))
      throw new BadRequestException("Discount cannot exceed proposal amount");
    const lead = await this.prisma.lead.findFirst({
      where: {
        id: dto.leadId,
        ...leadScope(user),
      },
    });
    if (!lead) throw new NotFoundException("Lead not found");
    if (lead.stage === LeadStage.WON || lead.stage === LeadStage.LOST)
      throw new BadRequestException("Closed leads cannot receive proposals");
    if (lead.stage !== LeadStage.PROPOSAL)
      this.transitions.assertAllowed(lead.stage, LeadStage.PROPOSAL);

    const finalAmount = proposalAmount.minus(discount).plus(tax);
    const proposalDate = dto.proposalDate
      ? new Date(dto.proposalDate)
      : new Date();
    const followUpAt = new Date(dto.followUpAt);
    return this.prisma.$transaction(async (tx) => {
      await assertLeadHasNoOtherActiveWork(tx, lead.id);
      const stageChanged = lead.stage !== LeadStage.PROPOSAL;
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          stage: LeadStage.PROPOSAL,
          stageEnteredAt: stageChanged ? new Date() : undefined,
          nextAction: dto.nextAction,
          followUpAt: new Date(dto.followUpAt),
          activities: {
            create: {
              type: "PROPOSAL_SENT",
              description: proposalActivityDescription({
                leadNumber: lead.leadNumber,
                serviceProduct: dto.serviceProduct,
                proposalDate,
                proposalAmount: proposalAmount.toString(),
                discount: discount.toString(),
                tax: tax.toString(),
                finalAmount: finalAmount.toString(),
                customerResponse: dto.customerResponse,
                followUpAt,
                nextAction: dto.nextAction,
                remarks: dto.remarks,
              }),
              contactDate: proposalDate,
              contactType: "Proposal",
              customerResponse: dto.customerResponse?.trim() || undefined,
              nextAction: dto.nextAction,
              followUpAt,
              remarks: dto.remarks?.trim() || undefined,
              user: { connect: { id: user.sub } },
            },
          },
          followUps: {
            create: {
              dueAt: followUpAt,
              type: "Proposal Follow-up",
              nextAction: dto.nextAction,
            },
          },
        },
      });
      return tx.proposal.create({
        data: {
          leadId: lead.id,
          proposalDate,
          serviceProduct: dto.serviceProduct,
          proposalAmount,
          discount,
          tax,
          finalAmount,
          customerResponse: dto.customerResponse,
          followUpAt,
          remarks: dto.remarks,
        },
        include: {
          lead: {
            select: {
              leadNumber: true,
              customerName: true,
              assignedBde: { select: { fullName: true } },
            },
          },
        },
      });
    });
  }

  async update(id: string, dto: UpdateProposalDto, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    const proposal = await this.prisma.proposal.findFirst({
      where: {
        id,
        ...(user.role === "ADMIN" ? {} : { lead: leadScope(user) }),
      },
      include: { lead: true },
    });
    if (!proposal) throw new NotFoundException("Proposal not found");
    if (dto.nextAction === "Negotiation" && !dto.customerResponse?.trim()) {
      throw new BadRequestException("A customer response is required.");
    }
    if (
      dto.nextAction === "Negotiation" &&
      dto.customerExpectedAmount === undefined
    ) {
      throw new BadRequestException(
        "The customer's expected amount is required to start a negotiation.",
      );
    }
    if (dto.nextAction && proposal.responseSavedAt) {
      throw new BadRequestException(
        "A response has already been saved for this proposal.",
      );
    }
    const targetStage =
      dto.nextAction === "Negotiation"
        ? LeadStage.NEGOTIATION
        : dto.nextAction === "Won"
          ? LeadStage.WON
          : dto.nextAction === "Lost"
            ? LeadStage.LOST
            : undefined;
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
        "Expected timeline and payment details are required to mark this proposal Won.",
      );
    }
    if (
      dto.nextAction === "Won" &&
      dto.paymentStatus === "Advance Payment" &&
      new Prisma.Decimal(dto.advanceAmount!).gt(proposal.finalAmount)
    ) {
      throw new BadRequestException(
        "Advance payment cannot exceed the proposal's final amount.",
      );
    }
    if (targetStage) {
      this.transitions.assertAllowed(proposal.lead.stage, targetStage);
    }
    const stageChanged =
      targetStage !== undefined && targetStage !== proposal.lead.stage;
    const isClosedOutcome =
      targetStage === LeadStage.WON || targetStage === LeadStage.LOST;
    return this.prisma.$transaction(async (tx) => {
      const responseSavedAt = dto.nextAction ? new Date() : undefined;
      let effectivePaymentStatus = dto.paymentStatus;
      const initialPaidAmount =
        targetStage === LeadStage.WON
          ? dto.paymentStatus === "Fully Paid"
            ? new Prisma.Decimal(proposal.finalAmount)
            : dto.paymentStatus === "Advance Payment"
              ? new Prisma.Decimal(dto.advanceAmount!)
              : new Prisma.Decimal(0)
          : undefined;
      if (initialPaidAmount) {
        effectivePaymentStatus = initialPaidAmount.gte(proposal.finalAmount)
          ? "Fully Paid"
          : dto.paymentStatus!;
      }
      if (responseSavedAt) {
        const responseUpdate = await tx.proposal.updateMany({
          where: { id, responseSavedAt: null },
          data: {
            customerResponse: dto.customerResponse?.trim() ?? null,
            responseSavedAt,
          },
        });
        if (responseUpdate.count !== 1) {
          throw new BadRequestException(
            "A response has already been saved for this proposal.",
          );
        }
      }
      if (dto.followUpAt) {
        await assertLeadHasNoOtherActiveWork(tx, proposal.leadId);
      }
      if (isClosedOutcome) {
        await lockLeadActiveWork(tx, proposal.leadId);
      }
      if (dto.followUpAt || dto.nextAction || targetStage) {
        const nextAction =
          dto.nextAction === "Negotiation"
            ? "Follow up on negotiation"
            : dto.nextAction ?? proposal.lead.nextAction ?? "Follow up on proposal";
        const dueAt = dto.followUpAt
          ? new Date(dto.followUpAt)
          : proposal.lead.followUpAt;
        await tx.lead.update({
          where: { id: proposal.leadId },
          data: {
            stage: targetStage,
            stageEnteredAt: stageChanged ? new Date() : undefined,
            nextAction: isClosedOutcome ? null : nextAction,
            followUpAt: isClosedOutcome
              ? null
              : dto.followUpAt
                ? dueAt
                : undefined,
            lostReason:
              targetStage === LeadStage.LOST ? dto.lostReason!.trim() : undefined,
            finalDealValue:
              targetStage === LeadStage.WON ? proposal.finalAmount : undefined,
            wonService:
              targetStage === LeadStage.WON
                ? proposal.serviceProduct
                : undefined,
            ...(targetStage === LeadStage.WON
              ? {
                  paymentStatus: effectivePaymentStatus,
                  paidAmount: initialPaidAmount,
                  advanceAmount:
                    effectivePaymentStatus === "Advance Payment"
                      ? dto.advanceAmount
                      : null,
                  confirmedAt: new Date(),
                }
              : {}),
            ...(isClosedOutcome
              ? {
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
                }
              : dto.followUpAt
              ? {
                  followUps: {
                    create: {
                      dueAt: dueAt!,
                      type: "Proposal Follow-up",
                      nextAction,
                    },
                  },
                }
              : {}),
          },
        });
        if (targetStage === LeadStage.WON) {
          await tx.activity.create({
            data: {
              leadId: proposal.leadId,
              userId: user.sub,
              type: "DEAL_WON",
              description: `Deal won for ${proposal.finalAmount}`,
              outcome: `Payment status: ${effectivePaymentStatus}`,
              expectedTimeline: dto.expectedTimeline!.trim(),
            },
          });
          if (initialPaidAmount!.gt(0)) {
            const finalDealValue = new Prisma.Decimal(proposal.finalAmount);
            await tx.activity.create({
              data: {
                leadId: proposal.leadId,
                userId: user.sub,
                type: "PAYMENT_RECEIVED",
                description: `${effectivePaymentStatus} recorded`,
                outcome: `Received ₹${initialPaidAmount!.toFixed(2)}; paid ₹${initialPaidAmount!.toFixed(2)} of ₹${finalDealValue.toFixed(2)}; balance ₹${finalDealValue.sub(initialPaidAmount!).toFixed(2)}`,
                paymentAmount: initialPaidAmount,
                paymentStatus: effectivePaymentStatus,
                paymentTotal: initialPaidAmount,
                paymentBalance: finalDealValue.sub(initialPaidAmount!),
              },
            });
          }
        }
      }
      if (dto.nextAction === "Negotiation") {
        const negotiation = await tx.negotiation.create({
          data: {
            leadId: proposal.leadId,
            originalProposalAmount: proposal.finalAmount,
            customerExpectedAmount: dto.customerExpectedAmount!,
            customerConcern: dto.customerResponse!.trim(),
            nextAction: "Follow up on negotiation",
            followUpAt:
              proposal.followUpAt ??
              proposal.lead.followUpAt ??
              new Date(),
          },
        });
        const pendingFollowUps = await tx.followUp.updateMany({
          where: {
            leadId: proposal.leadId,
            type: "Proposal Follow-up",
            status: "PENDING",
          },
          data: {
            type: "Negotiation",
            nextAction: "Follow up on negotiation",
            negotiationId: negotiation.id,
          },
        });
        if (pendingFollowUps.count === 0) {
          const followUp = await tx.followUp.create({
            data: {
              leadId: proposal.leadId,
              type: "Negotiation",
              nextAction: "Follow up on negotiation",
              dueAt:
                proposal.followUpAt ??
                proposal.lead.followUpAt ??
                new Date(),
            },
          });
          await tx.$executeRaw`
            UPDATE "follow_ups"
            SET "negotiation_id" = ${negotiation.id}::uuid
            WHERE "id" = ${followUp.id}::uuid
          `;
        }
      }
      return tx.proposal.update({
        where: { id },
        data: {
          customerResponse: dto.customerResponse?.trim(),
          responseSavedAt,
          followUpAt: dto.followUpAt ? new Date(dto.followUpAt) : undefined,
          remarks: dto.remarks,
        },
      });
    });
  }
}
