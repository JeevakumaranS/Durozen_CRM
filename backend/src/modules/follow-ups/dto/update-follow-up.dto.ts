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
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  customerBudget?: number | null;

  @IsOptional()
  @IsString()
  expectedTimeline?: string;

  @IsOptional()
  @IsDateString()
  confirmedAt?: string;

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
  @IsDateString()
  proposalDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/)
  serviceProduct?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  proposalAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  negotiatedAmount?: number;

  @IsOptional()
  @IsIn(["Advance Amount", "Not Paid", "Fully Paid"])
  paymentStatus?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  advanceAmount?: number;

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

}
