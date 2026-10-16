import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { LeadStage } from "@prisma/client";
import { Actor, assertActorRole } from "../../common/authorization/actor-role";
import { leadScope } from "../../common/authorization/lead-scope";
import { PrismaService } from "../../prisma/prisma.service";
import { StageTransitionService } from "../pipeline/stage-transition.service";
import { CreateNegotiationDto } from "./dto/create-negotiation.dto";

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
          followUps: {
            create: {
              dueAt: new Date(dto.followUpAt),
              type: "Negotiation",
              nextAction: dto.nextAction,
            },
          },
        },
      });
      return tx.negotiation.create({
        data: {
          leadId: lead.id,
          originalProposalAmount,
          customerExpectedAmount: dto.customerExpectedAmount,
          negotiatedAmount: dto.negotiatedAmount,
          customerConcern: dto.customerConcern,
          competitorInformation: dto.competitorInformation,
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
    });
  }
}
