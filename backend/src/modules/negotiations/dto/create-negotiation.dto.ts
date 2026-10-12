import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from "class-validator";

export class CreateNegotiationDto {
  @IsUUID() leadId!: string;
  @IsOptional() @IsNumber() @Min(0) originalProposalAmount?: number;
  @IsOptional() @IsNumber() @Min(0) customerExpectedAmount?: number;
  @IsOptional() @IsNumber() @Min(0) negotiatedAmount?: number;
  @IsOptional() @IsString() customerConcern?: string;
  @IsOptional() @IsString() competitorInformation?: string;
  @IsString() nextAction!: string;
  @IsDateString() followUpAt!: string;
  @IsOptional() @IsString() remarks?: string;
}
