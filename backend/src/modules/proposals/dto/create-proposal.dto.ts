import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from "class-validator";

export class CreateProposalDto {
  @IsUUID() leadId!: string;
  @IsOptional() @IsDateString() proposalDate?: string;
  @IsString() serviceProduct!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) proposalAmount!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) discount?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) tax?: number;
  @IsOptional() @IsString() customerResponse?: string;
  @IsDateString() followUpAt!: string;
  @IsString() nextAction!: string;
  @IsOptional() @IsString() remarks?: string;
}
