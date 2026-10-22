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
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  originalProposalAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  customerExpectedAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  negotiatedAmount?: number;
  @IsOptional() @IsString() customerConcern?: string;
  @IsString() nextAction!: string;
  @IsDateString() followUpAt!: string;
  @IsOptional() @IsString() remarks?: string;
}
