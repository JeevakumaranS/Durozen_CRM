import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

@Injectable()
export class ProposalNumberService {
  createNumber(sequence: number, date = new Date()): string {
    const year = date.getFullYear();
    return `PROP-${year}-${String(sequence).padStart(5, "0")}`;
  }
}

export async function nextProposalNumber(
  year: number,
  client: Pick<Prisma.TransactionClient, "proposal">,
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
