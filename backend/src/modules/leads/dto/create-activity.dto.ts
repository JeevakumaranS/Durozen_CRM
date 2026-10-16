import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
} from "class-validator";

export class CreateActivityDto {
  @IsIn([
    "Call",
    "WhatsApp",
    "Email",
    "Meeting",
    "Demo",
    "Note",
    "Proposal",
    "Proposal Sent",
    "Negotiation",
  ])
  type!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  outcome?: string;

  @IsString()
  @Matches(/\S/)
  nextAction!: string;

  @IsDateString()
  followUpAt!: string;
}
