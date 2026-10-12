import { IsDateString, IsIn, IsOptional, IsString } from "class-validator";

export class CreateActivityDto {
  @IsIn([
    "Call",
    "WhatsApp",
    "Email",
    "Meeting",
    "Demo",
    "Note",
    "Proposal Sent",
    "Negotiation",
  ])
  type!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  outcome?: string;

  @IsOptional()
  @IsString()
  nextAction?: string;

  @IsOptional()
  @IsDateString()
  followUpAt?: string;
}
