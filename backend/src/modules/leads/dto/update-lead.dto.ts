import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from "class-validator";
import { LeadStage } from "./create-lead.dto";

export class UpdateLeadDto {
  @IsOptional() @IsDateString() leadDate?: string;
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsString() businessName?: string;
  @IsOptional() @Matches(/^[+0-9() -]{7,30}$/) mobileNumber?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() leadSource?: string;
  @IsOptional() @IsUUID() assignedBdeId?: string;
  @IsOptional() @IsEnum(LeadStage) stage?: LeadStage;
  @IsOptional() @IsString() nextAction?: string;
  @IsOptional() @IsDateString() followUpAt?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsString() requirement?: string;
  @IsOptional() @IsEnum(["HOT", "WARM", "COLD"]) priority?:
    | "HOT"
    | "WARM"
    | "COLD";
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) estimatedBudget?: number | null;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  finalDealValue?: number;

  @IsOptional()
  @IsString()
  wonService?: string;

  @IsOptional()
  @IsString()
  paymentStatus?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  advanceAmount?: number;

  @IsOptional()
  @IsString()
  lostReason?: string;

  @IsOptional()
  @IsDateString()
  contactDate?: string;

  @IsOptional()
  @IsIn(["Phone Call", "WhatsApp", "Email", "Direct Meeting", "Other"])
  contactType?: string;

  @IsOptional()
  @IsString()
  customerResponse?: string;

  @IsOptional()
  @IsString()
  expectedTimeline?: string;

  @IsOptional()
  @IsBoolean()
  scheduleMeeting?: boolean;

  @IsOptional()
  @IsDateString()
  meetingAt?: string;

  @IsOptional()
  @IsIn([
    "Online Meeting",
    "Offline Meeting",
    "Product Demo",
    "Requirement Discussion",
    "Business Discussion",
  ])
  meetingType?: string;
}
