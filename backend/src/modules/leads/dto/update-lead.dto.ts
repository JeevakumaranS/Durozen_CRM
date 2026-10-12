import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
} from "class-validator";
import { LeadStage } from "./create-lead.dto";

export class UpdateLeadDto {
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsString() businessName?: string;
  @IsOptional() @Matches(/^[+0-9() -]{7,30}$/) mobileNumber?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() businessCategory?: string;
  @IsOptional() @IsString() leadSource?: string;
  @IsOptional() @IsUUID() assignedBdeId?: string;
  @IsOptional() @IsEnum(LeadStage) stage?: LeadStage;
  @IsOptional() @IsString() nextAction?: string;
  @IsOptional() @IsDateString() followUpAt?: string;
  @IsOptional() @IsString() requirement?: string;
  @IsOptional() @IsEnum(["HOT", "WARM", "COLD"]) priority?:
    | "HOT"
    | "WARM"
    | "COLD";
  @IsOptional() @IsNumber() @Min(0) estimatedBudget?: number;
  @IsOptional()
  @IsNumber()
  @Min(0)
  finalDealValue?: number;

  @IsOptional()
  @IsString()
  wonService?: string;

  @IsOptional()
  @IsString()
  paymentStatus?: string;

  @IsOptional()
  @IsDateString()
  expectedStartDate?: string;

  @IsOptional()
  @IsString()
  wonRemarks?: string;

  @IsOptional()
  @IsString()
  lostReason?: string;
}
