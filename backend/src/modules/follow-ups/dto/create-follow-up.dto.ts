import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
} from "class-validator";

export class CreateFollowUpDto {
  @IsUUID()
  leadId!: string;

  @IsDateString()
  dueAt!: string;

  @IsIn(["Proposal Follow-up", "Negotiation"])
  type!: string;

  @IsString()
  nextAction!: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
