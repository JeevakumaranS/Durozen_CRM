import {
  IsDateString,
  IsIn,
  IsOptional,
  IsNumber,
  Min,
  IsString,
  Matches,
} from "class-validator";

export class UpdateProposalDto {
  @IsOptional() @IsString() @Matches(/\S/) customerResponse?: string;
  @IsOptional() @IsNumber() @Min(0) customerExpectedAmount?: number;
  @IsOptional() @IsDateString() followUpAt?: string;
  @IsOptional() @IsIn(["Negotiation", "Won", "Lost"]) nextAction?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsString() lostReason?: string;
}
