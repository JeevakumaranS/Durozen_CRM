import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { LeadStage } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { StageTransitionService } from "../pipeline/stage-transition.service";
import { CreateProposalDto } from "./dto/create-proposal.dto";
import { UpdateProposalDto } from "./dto/update-proposal.dto";

type Actor = { sub: string; role: string };

@Injectable()
export class ProposalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: StageTransitionService,
  ) {}

  list(user: Actor) {
    return this.prisma.proposal.findMany({
      where:
        user.role === "BDE" ? { lead: { assignedBdeId: user.sub } } : undefined,
      include: {
        lead: { include: { assignedBde: { select: { fullName: true } } } },
      },
      orderBy: { proposalDate: "desc" },
    });
  }

  async create(dto: CreateProposalDto, user: Actor) {
    if ((dto.discount ?? 0) > dto.proposalAmount)
      throw new BadRequestException("Discount cannot exceed proposal amount");
    const lead = await this.prisma.lead.findUnique({
      where: { id: dto.leadId },
    });
    if (!lead) throw new NotFoundException("Lead not found");
    if (user.role === "BDE" && lead.assignedBdeId !== user.sub)
      throw new ForbiddenException(
        "BDE users can only create proposals for their assigned leads",
      );
    if (lead.stage === LeadStage.WON || lead.stage === LeadStage.LOST)
      throw new BadRequestException("Closed leads cannot receive proposals");
    if (lead.stage !== LeadStage.PROPOSAL)
      this.transitions.assertAllowed(lead.stage, LeadStage.PROPOSAL);

    const finalAmount =
      dto.proposalAmount - (dto.discount ?? 0) + (dto.tax ?? 0);
    const proposalNumber = `DZN-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    return this.prisma.$transaction(async (tx) => {
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
              description: `Proposal ${proposalNumber} prepared for ${dto.serviceProduct}`,
              userId: user.sub,
              previousStage: stageChanged ? lead.stage : undefined,
              newStage: stageChanged ? LeadStage.PROPOSAL : undefined,
            },
          },
          followUps: {
            create: {
              dueAt: new Date(dto.followUpAt),
              type: "Proposal Follow-up",
              nextAction: dto.nextAction,
            },
          },
        },
      });
      return tx.proposal.create({
        data: {
          leadId: lead.id,
          proposalNumber,
          serviceProduct: dto.serviceProduct,
          proposalAmount: dto.proposalAmount,
          discount: dto.discount ?? 0,
          tax: dto.tax ?? 0,
          finalAmount,
          validityUntil: dto.validityUntil
            ? new Date(dto.validityUntil)
            : undefined,
          sentAt: dto.sentAt ? new Date(dto.sentAt) : undefined,
          customerResponse: dto.customerResponse,
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
    });
  }

  async update(id: string, dto: UpdateProposalDto, user: Actor) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { id },
      include: { lead: true },
    });
    if (!proposal) throw new NotFoundException("Proposal not found");
    if (user.role === "BDE" && proposal.lead.assignedBdeId !== user.sub)
      throw new ForbiddenException(
        "BDE users can only update their assigned proposals",
      );
    return this.prisma.$transaction(async (tx) => {
      if (dto.followUpAt || dto.nextAction) {
        const nextAction =
          dto.nextAction ?? proposal.lead.nextAction ?? "Follow up on proposal";
        const dueAt = dto.followUpAt
          ? new Date(dto.followUpAt)
          : proposal.lead.followUpAt;
        await tx.lead.update({
          where: { id: proposal.leadId },
          data: {
            nextAction,
            followUpAt: dto.followUpAt ? dueAt : undefined,
            ...(dto.followUpAt
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
      }
      return tx.proposal.update({
        where: { id },
        data: {
          customerResponse: dto.customerResponse,
          followUpAt: dto.followUpAt ? new Date(dto.followUpAt) : undefined,
          remarks: dto.remarks,
        },
      });
    });
  }
}
