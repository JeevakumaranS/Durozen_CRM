import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { LeadStage, Prisma } from "@prisma/client";
import { Actor, assertActorRole } from "../../common/authorization/actor-role";
import { leadScope } from "../../common/authorization/lead-scope";
import { PrismaService } from "../../prisma/prisma.service";
import { StageTransitionService } from "../pipeline/stage-transition.service";
import { CreateProposalDto } from "./dto/create-proposal.dto";
import { UpdateProposalDto } from "./dto/update-proposal.dto";

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

  async nextNumber(user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    const year = new Date().getFullYear();
    return {
      proposalNumber: await this.nextProposalNumber(year),
      year,
    };
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
      select: { finalAmount: true, serviceProduct: true },
    });
    if (!proposal) throw new NotFoundException("No proposal found for this lead");
    return {
      originalProposalAmount: Number(proposal.finalAmount),
      serviceProduct: proposal.serviceProduct,
    };
  }

  async create(dto: CreateProposalDto, user: Actor) {
    assertActorRole(user, ["ADMIN", "BDE", "SALES_MANAGER"]);
    if ((dto.discount ?? 0) > dto.proposalAmount)
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

    const finalAmount =
      dto.proposalAmount - (dto.discount ?? 0) + (dto.tax ?? 0);
    const year = new Date().getFullYear();
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        WITH proposal_lock AS MATERIALIZED (
          SELECT pg_advisory_xact_lock(${year}::integer, 0::integer)
        )
        SELECT 1::integer AS locked FROM proposal_lock
      `;
      const proposalNumber = await this.nextProposalNumber(year, tx);
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
              user: { connect: { id: user.sub } },
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
          proposalDate: dto.proposalDate
            ? new Date(dto.proposalDate)
            : new Date(),
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

  private async nextProposalNumber(
    year: number,
    client: Pick<Prisma.TransactionClient, "proposal"> = this.prisma,
  ) {
    const prefix = `DZN-${year}-`;
    const existing = await client.proposal.findMany({
      where: { proposalNumber: { startsWith: prefix } },
      select: { proposalNumber: true },
    });
    const highest = existing.reduce((current, proposal) => {
      const match = new RegExp(`^DZN-${year}-(\\d+)$`).exec(
        proposal.proposalNumber,
      );
      return match ? Math.max(current, Number(match[1])) : current;
    }, 0);
    return `${prefix}${String(highest + 1).padStart(5, "0")}`;
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
