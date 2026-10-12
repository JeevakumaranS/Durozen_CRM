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

  @IsIn([
    "Call",
    "WhatsApp",
    "Meeting",
    "Demo",
    "Email",
    "Proposal Follow-up",
    "Negotiation",
    "Other",
  ])
  type!: string;

  @IsString()
  nextAction!: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
