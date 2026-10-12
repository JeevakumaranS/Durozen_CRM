import { BadRequestException } from "@nestjs/common";
import { LeadStage } from "@prisma/client";
export function enforceNextAction(
  stage: LeadStage,
  nextAction?: string,
  followUpAt?: Date,
) {
  if (!["WON", "LOST"].includes(stage) && (!nextAction?.trim() || !followUpAt))
    throw new BadRequestException(
      "Please enter the next action or follow-up date.",
    );
}
