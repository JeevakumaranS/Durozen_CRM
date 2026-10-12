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
  @IsString() serviceProduct!: string;
  @IsNumber() @Min(0) proposalAmount!: number;
  @IsOptional() @IsNumber() @Min(0) discount?: number;
  @IsOptional() @IsNumber() @Min(0) tax?: number;
  @IsOptional() @IsDateString() validityUntil?: string;
  @IsOptional() @IsDateString() sentAt?: string;
  @IsOptional() @IsString() customerResponse?: string;
  @IsDateString() followUpAt!: string;
  @IsString() nextAction!: string;
  @IsOptional() @IsString() remarks?: string;
}
