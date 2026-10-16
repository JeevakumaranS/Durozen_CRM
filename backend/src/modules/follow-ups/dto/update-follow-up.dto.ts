import { FollowUpStatus, LeadStage } from "@prisma/client";
import {
  IsDateString,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from "class-validator";

export class UpdateFollowUpDto {
  @IsEnum(FollowUpStatus)
  status!: FollowUpStatus;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @IsOptional()
  @IsString()
  nextAction?: string;

  @IsOptional()
  @IsString()
  remarks?: string | null;

  @IsOptional()
  @IsDateString()
  contactDate?: string;

  @IsOptional()
  @IsIn(["Phone Call", "WhatsApp", "Email", "Direct Meeting", "Other"])
  contactType?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  customerResponse?: string;

  @IsOptional()
  @IsString()
  requirement?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  customerBudget?: number | null;

  @IsOptional()
  @IsString()
  expectedTimeline?: string;

  @IsOptional()
  @IsEnum(LeadStage)
  nextStage?: LeadStage;

  @IsOptional()
  @IsString()
  lostReason?: string;

  @IsOptional()
  @IsIn(["Customer requested", "Customer unavailable", "BDE unavailable"])
  rescheduleReason?: string;

  @IsOptional()
  @IsBoolean()
  scheduleMeeting?: boolean;

  @IsOptional()
  @IsDateString()
  meetingAt?: string;

  @IsOptional()
  @IsIn([
    "In-person",
    "Phone",
    "Video",
    "Online Meeting",
    "Offline Meeting",
    "Product Demo",
    "Requirement Discussion",
    "Business Discussion",
  ])
  meetingType?: string;

  @IsOptional()
  @IsString()
  meetingParticipants?: string;
}
