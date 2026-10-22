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
export enum LeadStage {
  NEW_LEAD = "NEW_LEAD",
  CONTACTED = "CONTACTED",
  INTERESTED = "INTERESTED",
  MEETING = "MEETING",
  PROPOSAL = "PROPOSAL",
  NEGOTIATION = "NEGOTIATION",
  WON = "WON",
  LOST = "LOST",
}
export class CreateLeadDto {
  @IsOptional() @IsDateString() leadDate?: string;
  @IsString() customerName!: string;
  @IsOptional() @IsString() businessName?: string;
  @Matches(/^[+0-9() -]{7,30}$/) mobileNumber!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() location?: string;
  @IsString() leadSource!: string;
  @IsUUID() assignedBdeId!: string;
  @IsString() nextAction!: string;
  @IsDateString() followUpAt!: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsString() requirement?: string;
  @IsOptional() @IsEnum(["HOT", "WARM", "COLD"]) priority?:
    | "HOT"
    | "WARM"
    | "COLD";
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) estimatedBudget?: number;
  @IsOptional() @IsEnum(LeadStage) stage?: LeadStage;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) finalDealValue?: number;
  @IsOptional() @IsString() wonService?: string;
  @IsOptional() @IsString() paymentStatus?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) advanceAmount?: number;
  @IsOptional() @IsString() lostReason?: string;
}
