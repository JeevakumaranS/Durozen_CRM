import { IsDateString, IsOptional, IsString } from "class-validator";

export class UpdateProposalDto {
  @IsOptional() @IsString() customerResponse?: string;
  @IsOptional() @IsDateString() followUpAt?: string;
  @IsOptional() @IsString() nextAction?: string;
  @IsOptional() @IsString() remarks?: string;
}
