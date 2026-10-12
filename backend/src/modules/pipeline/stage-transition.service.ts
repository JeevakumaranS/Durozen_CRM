import { BadRequestException, Injectable } from "@nestjs/common";
import { LeadStage } from "@prisma/client";
import { canTransition } from "./stage-rules";

@Injectable()
export class StageTransitionService {
  assertAllowed(from: LeadStage, to: LeadStage): void {
    if (!canTransition(from, to)) {
      throw new BadRequestException(`Lead cannot move from ${from} to ${to}`);
    }
  }
}
