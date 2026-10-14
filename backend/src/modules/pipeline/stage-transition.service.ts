import { BadRequestException, Injectable } from "@nestjs/common";
import { LeadStage } from "@prisma/client";
import { canTransition } from "./stage-rules";

@Injectable()
export class StageTransitionService {
  canTransition(from: LeadStage, to: LeadStage): boolean {
    return canTransition(from, to);
  }

  assertAllowed(from: LeadStage, to: LeadStage): void {
    if (!this.canTransition(from, to)) {
      throw new BadRequestException(`Lead cannot move from ${from} to ${to}`);
    }
  }
}
