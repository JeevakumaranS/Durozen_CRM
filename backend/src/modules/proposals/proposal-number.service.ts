import { Injectable } from "@nestjs/common";

@Injectable()
export class ProposalNumberService {
  createNumber(sequence: number, date = new Date()): string {
    const year = date.getFullYear();
    return `PROP-${year}-${String(sequence).padStart(5, "0")}`;
  }
}
