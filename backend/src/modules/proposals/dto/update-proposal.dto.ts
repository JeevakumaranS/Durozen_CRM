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
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) customerExpectedAmount?: number;
  @IsOptional() @IsDateString() followUpAt?: string;
  @IsOptional() @IsIn(["Negotiation", "Won", "Lost"]) nextAction?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsString() lostReason?: string;
  @IsOptional() @IsString() @Matches(/\S/) expectedTimeline?: string;
  @IsOptional()
  @IsIn(["Advance Payment", "Fully Paid", "Not Paid"])
  paymentStatus?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) advanceAmount?: number;
}
